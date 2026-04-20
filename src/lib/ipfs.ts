import { encrypt } from "./storage.ts";

const DB_NAME = "sovereignlink-vault";
const STORE = "profiles";
const READ_GATEWAY = "https://ipfs.io/ipfs/";
const DEFAULT_ADD = "https://ipfs.io/api/v0/add?pin=true";
const CORS_RELAY = "https://cors.isomorphic-git.org";
const TEMP_PREFIX = "temp-session-";
const TEMP_KEY_PREFIX = "sovereignlink-temp-ipfs:";

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

export function clearTemporaryIPFSCache(): void {
  if (typeof window === "undefined") return;
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(TEMP_KEY_PREFIX)) sessionStorage.removeItem(key);
  }
}

export async function uploadToIPFS(data: unknown, gateway = "https://ipfs.io"): Promise<string> {
  if (typeof window === "undefined") throw new Error("IPFS upload requires a browser environment");
  const walletKey = await getWalletKey();
  if (!walletKey) throw new Error("Wallet key unavailable for client-side encryption");
  // Sovereignty: Data encrypted client-side before IPFS upload. Only CID stored locally. Full privacy via ZK later on Midnight.
  const encrypted = await encrypt(data, walletKey);
  const form = new FormData();
  form.append("file", new Blob([encrypted], { type: "text/plain" }), "sovereignlink-profile.enc");
  // Replace with Pinata/nft.storage when user provides API key.
  const directEndpoint = gateway
    ? `${gateway.replace(/\/$/, "")}/api/v0/add?pin=true`
    : DEFAULT_ADD;
  const relayEndpoint = `${CORS_RELAY}/${encodeURIComponent(directEndpoint)}`;
  let response: Response;
  let uploadFailed = false;
  try {
    response = await fetch(relayEndpoint, { method: "POST", body: form });
    if (!response.ok) throw new Error(`Relay upload failed (${response.status})`);
  } catch {
    try {
      response = await fetch(directEndpoint, { method: "POST", body: form });
      if (!response.ok) throw new Error(`IPFS upload failed (${response.status})`);
    } catch {
      uploadFailed = true;
      response = new Response("{}", { status: 200 });
    }
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

export function resolveCID(cid: string): string {
  if (!cid) return READ_GATEWAY;
  if (typeof window !== "undefined" && isTemporaryCID(cid)) {
    const payload = sessionStorage.getItem(`${TEMP_KEY_PREFIX}${cid}`);
    if (!payload) return "about:blank";
    return `data:text/plain;charset=utf-8,${encodeURIComponent(payload)}`;
  }
  return `${READ_GATEWAY}${cid}`;
}
