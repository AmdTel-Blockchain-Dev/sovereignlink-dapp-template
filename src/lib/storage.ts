export type SovereignProfile = {
  did: string;
  alias: string;
  bio?: string;
  avatarCid?: string;
  ipfsCid?: string;
  vaultTier?: "local" | "shielded";
  lastCommitment?: string;
  lastUpgradeTx?: string;
  lastUpgradeStatus?: string;
  createdAt: number;
};

type VaultRecord = { id: "me"; ciphertext: string; walletKeyB64: string };

const DB_NAME = "sovereignlink-vault";
const STORE = "profiles";

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Copy into a fresh ArrayBuffer to satisfy strict Web Crypto BufferSource typing.
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  return normalized.buffer;
}

async function deriveAesKey(walletPublicKey: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(walletPublicKey),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(`${DB_NAME}:${STORE}`),
      iterations: 120_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(data: unknown, key: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(key);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain),
  );
  return `${toBase64(iv)}.${toBase64(sealed)}`;
}

export async function decrypt(ciphertext: string, key: Uint8Array): Promise<unknown> {
  const [ivB64, bodyB64] = ciphertext.split(".");
  if (!ivB64 || !bodyB64) throw new Error("Invalid ciphertext format");
  const aesKey = await deriveAesKey(key);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(fromBase64(ivB64)) },
    aesKey,
    toArrayBuffer(fromBase64(bodyB64)),
  );
  return JSON.parse(new TextDecoder().decode(opened));
}

async function getDb(): Promise<IDBDatabase | null> {
  // Sovereignty/privacy: data is sealed client-side before persistence; IndexedDB only stores ciphertext.
  if (typeof window === "undefined") return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function saveProfile(
  data: SovereignProfile & { walletPublicKey: Uint8Array },
): Promise<undefined | null> {
  const db = await getDb();
  if (!db) return null;
  const { walletPublicKey, ...profile } = data;
  const record: VaultRecord = {
    id: "me",
    ciphertext: await encrypt(profile, walletPublicKey),
    walletKeyB64: toBase64(walletPublicKey),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
}

export async function loadProfile(): Promise<SovereignProfile | null> {
  const db = await getDb();
  if (!db) return null;
  const record = await new Promise<VaultRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("me");
    req.onsuccess = () => resolve(req.result as VaultRecord | undefined);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });
  if (!record) return null;
  return (await decrypt(record.ciphertext, fromBase64(record.walletKeyB64))) as SovereignProfile;
}

export async function clearProfile(): Promise<undefined | null> {
  const db = await getDb();
  if (!db) return null;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete("me");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
}
