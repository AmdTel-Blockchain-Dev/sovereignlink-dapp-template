import { encrypt } from "./storage.ts";

const DB_NAME = "sovereignlink-vault";
const STORE = "profiles";
const TEMP_PREFIX = "temp-session-";
const TEMP_KEY_PREFIX = "sovereignlink-temp-ipfs:";

// Configured via PUBLIC_IPFS_API (upload endpoint) and PUBLIC_IPFS_GATEWAY (read gateway).
// In development, point these at a local Kubo node:
//   PUBLIC_IPFS_API=http://127.0.0.1:5001
//   PUBLIC_IPFS_GATEWAY=http://127.0.0.1:8080
// In production, public IPFS gateways or authenticated Pinata/nft.storage are used.
const CONFIGURED_API: string =
  typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_IPFS_API
    ? (import.meta.env.PUBLIC_IPFS_API as string).replace(/\/$/, "")
    : "https://ipfs.io";
const CONFIGURED_GATEWAY: string =
  typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_IPFS_GATEWAY
    ? (import.meta.env.PUBLIC_IPFS_GATEWAY as string).replace(/\/$/, "")
    : "https://ipfs.io";

const READ_GATEWAY = `${CONFIGURED_GATEWAY}/ipfs/`;
const DEFAULT_ADD = `${CONFIGURED_API}/api/v0/add?pin=true`;

export type IPFSUploadResult = {
  cid: string;
  source: "ipfs" | "temporary";
  durable: boolean;
  status: "ok" | "degraded";
};

type ProfileRecord = { id: "me"; walletKeyB64: string };

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function getWalletKey(): Promise<Uint8Array | null> {
  if (typeof window === "undefined") return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  const record = await new Promise<ProfileRecord | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get("me");
    req.onsuccess = () => resolve(req.result as ProfileRecord | undefined);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });
  return record?.walletKeyB64 ? fromBase64(record.walletKeyB64) : null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeTemporaryCid(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${payload}:${Date.now()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `${TEMP_PREFIX}${toHex(digest).slice(0, 40)}`;
}

export function isTemporaryCID(cid: string): boolean {
  return cid.startsWith(TEMP_PREFIX);
}

async function saveTemporaryUpload(payload: string): Promise<string> {
  if (typeof window === "undefined")
    throw new Error("Temporary upload cache requires browser environment");
  const cid = await makeTemporaryCid(payload);
  sessionStorage.setItem(`${TEMP_KEY_PREFIX}${cid}`, payload);
  return cid;
}

function isLocalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

function isRemotePublicGateway(apiEndpoint: string): boolean {
  const target = apiEndpoint.toLowerCase();
  // Treat ipfs.io and other public gateways (not localhost/127.0.0.1) as remote.
  // A local Kubo node at localhost:5001 is a real reachable API, not a public blocked gateway.
  return !target.includes("localhost") && !target.includes("127.0.0.1");
}

function shouldUseSessionFallbackOnly(apiEndpoint: string): boolean {
  // Only bypass network and fall back to session storage when the browser is on a local origin
  // AND the API target is a remote public gateway (which blocks browser POST due to CORS).
  // When a local Kubo node is configured, skip the fallback and attempt the real API call.
  return isLocalOrigin() && isRemotePublicGateway(apiEndpoint);
}

export function clearTemporaryIPFSCache(): void {
  if (typeof window === "undefined") return;
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(TEMP_KEY_PREFIX)) sessionStorage.removeItem(key);
  }
}

export async function uploadToIPFS(data: unknown, gateway = CONFIGURED_API): Promise<string> {
  if (typeof window === "undefined") throw new Error("IPFS upload requires a browser environment");
  const walletKey = await getWalletKey();
  if (!walletKey) throw new Error("Wallet key unavailable for client-side encryption");
  // Sovereignty: Data encrypted client-side before IPFS upload. Only CID stored locally. Full privacy via ZK later on Midnight.
  const encrypted = await encrypt(data, walletKey);
  const form = new FormData();
  form.append("file", new Blob([encrypted], { type: "text/plain" }), "sovereignlink-profile.enc");
  // Replace with Pinata/nft.storage when user provides API key.
  const directEndpoint = `${gateway.replace(/\/$/, "")}/api/v0/add?pin=true`;
  if (shouldUseSessionFallbackOnly(gateway)) {
    return saveTemporaryUpload(encrypted);
  }
  let response: Response;
  let uploadFailed = false;
  try {
    response = await fetch(directEndpoint, { method: "POST", body: form });
    if (!response.ok) throw new Error(`IPFS upload failed (${response.status})`);
  } catch {
    uploadFailed = true;
    response = new Response("{}", { status: 200 });
  }
  if (uploadFailed) {
    // Temporary session-only fallback for CORS-restricted environments.
    return saveTemporaryUpload(encrypted);
  }
  const text = await response.text();
  const first = text.trim().split("\n")[0] ?? "{}";
  const parsed = JSON.parse(first) as { Hash?: string; cid?: string; Cid?: string };
  const cid = parsed.Hash ?? parsed.cid ?? parsed.Cid;
  if (!cid) throw new Error("Upload succeeded but no CID returned");
  return cid;
}

export async function uploadCiphertextToIPFS(
  ciphertext: string,
  gateway = CONFIGURED_API,
): Promise<IPFSUploadResult> {
  if (typeof window === "undefined") throw new Error("IPFS upload requires a browser environment");
  const form = new FormData();
  form.append("file", new Blob([ciphertext], { type: "text/plain" }), "sovereignlink-backup.enc");
  const directEndpoint = `${gateway.replace(/\/$/, "")}/api/v0/add?pin=true`;
  if (shouldUseSessionFallbackOnly(gateway)) {
    const cid = await saveTemporaryUpload(ciphertext);
    return { cid, source: "temporary", durable: false, status: "degraded" };
  }
  let response: Response;
  let uploadFailed = false;
  try {
    response = await fetch(directEndpoint, { method: "POST", body: form });
    if (!response.ok) throw new Error(`IPFS upload failed (${response.status})`);
  } catch {
    uploadFailed = true;
    response = new Response("{}", { status: 200 });
  }
  if (uploadFailed) {
    const cid = await saveTemporaryUpload(ciphertext);
    return { cid, source: "temporary", durable: false, status: "degraded" };
  }
  const text = await response.text();
  const first = text.trim().split("\n")[0] ?? "{}";
  const parsed = JSON.parse(first) as { Hash?: string; cid?: string; Cid?: string };
  const cid = parsed.Hash ?? parsed.cid ?? parsed.Cid;
  if (!cid) throw new Error("Upload succeeded but no CID returned");
  return { cid, source: "ipfs", durable: true, status: "ok" };
}

export function resolveCID(cid: string): string {
  if (!cid) return READ_GATEWAY;
  if (typeof window !== "undefined" && isTemporaryCID(cid)) {
    const payload = sessionStorage.getItem(`${TEMP_KEY_PREFIX}${cid}`);
    if (!payload) return "about:blank";
    return `data:text/plain;charset=utf-8,${encodeURIComponent(payload)}`;
  }
  return `${READ_GATEWAY}${cid}`;
}
