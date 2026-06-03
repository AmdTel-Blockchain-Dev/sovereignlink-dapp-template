import {
  createEncryptedProfileSnapshot,
  decrypt,
  getStoredWalletKey,
  loadBackupIndex,
  loadLocalBackupSnapshot,
  saveBackupIndex,
  saveLocalBackupSnapshot,
  type BackupSnapshotMetadata,
  type BackupStore,
  type SovereignProfile,
} from "./storage.ts";
import { resolveCID, uploadCiphertextToIPFS } from "./ipfs.ts";

type BackupIndex = {
  preferredSource: BackupStore;
  lastSyncedAt: number;
  snapshots: BackupSnapshotMetadata[];
};

export type BackupStatus = {
  preferredSource: BackupStore;
  lastSyncedAt: number;
  snapshots: BackupSnapshotMetadata[];
  diverged: boolean;
};

export type BackupCandidate = {
  source: BackupStore;
  profile: SovereignProfile;
  metadata: BackupSnapshotMetadata;
};

export type BackupSyncResult = {
  preferredSource: BackupStore;
  status: BackupStatus;
  latestCid: string | null;
};

function makeProfileVersion(profile: SovereignProfile): number {
  return profile.profileVersion ?? 1;
}

function getLatestSnapshot(
  snapshots: BackupSnapshotMetadata[],
  source: BackupStore,
): BackupSnapshotMetadata | null {
  const sorted = snapshots
    .filter((item) => item.source === source)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted[0] ?? null;
}

function hasDivergence(snapshots: BackupSnapshotMetadata[]): boolean {
  const local = getLatestSnapshot(snapshots, "local");
  const ipfs = getLatestSnapshot(snapshots, "ipfs");
  if (!local || !ipfs) return false;
  return local.ciphertextHash !== ipfs.ciphertextHash;
}

function mergeSnapshot(
  snapshots: BackupSnapshotMetadata[],
  incoming: BackupSnapshotMetadata,
): BackupSnapshotMetadata[] {
  const filtered = snapshots.filter(
    (item) => !(item.source === incoming.source && item.ciphertextHash === incoming.ciphertextHash),
  );
  return [...filtered, incoming].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
}

async function fetchCiphertextFromCid(cid: string): Promise<string> {
  const url = resolveCID(cid);
  if (!url || url === "about:blank") throw new Error("Backup CID is unavailable in this session");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to read backup payload (${response.status})`);
  return response.text();
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const index = await loadBackupIndex();
  const snapshots = index?.snapshots ?? [];
  return {
    preferredSource: index?.preferredSource ?? "local",
    lastSyncedAt: index?.lastSyncedAt ?? 0,
    snapshots,
    diverged: hasDivergence(snapshots),
  };
}

export async function syncProfileBackups(profile: SovereignProfile): Promise<BackupSyncResult> {
  const walletKey = await getStoredWalletKey();
  if (!walletKey) throw new Error("Wallet key unavailable for backup sync");

  const snapshot = await createEncryptedProfileSnapshot(profile, walletKey);
  const now = Date.now();
  const profileVersion = makeProfileVersion(profile);

  const index = ((await loadBackupIndex()) ?? {
    preferredSource: "local",
    lastSyncedAt: 0,
    snapshots: [],
  }) as BackupIndex;

  const localExisting = getLatestSnapshot(index.snapshots, "local");
  const ipfsExisting = getLatestSnapshot(index.snapshots, "ipfs");

  if (!localExisting || localExisting.ciphertextHash !== snapshot.ciphertextHash) {
    const localMeta: BackupSnapshotMetadata = {
      source: "local",
      ciphertextHash: snapshot.ciphertextHash,
      profileVersion,
      updatedAt: now,
      durable: true,
      status: "ok",
    };
    await saveLocalBackupSnapshot({
      ciphertext: snapshot.ciphertext,
      walletPublicKey: walletKey,
      metadata: localMeta,
    });
    index.snapshots = mergeSnapshot(index.snapshots, localMeta);
  }

  let latestCid: string | null = null;
  const ipfsUnchanged = ipfsExisting && ipfsExisting.ciphertextHash === snapshot.ciphertextHash;
  if (ipfsUnchanged && ipfsExisting?.cid) {
    latestCid = ipfsExisting.cid;
  } else {
    const upload = await uploadCiphertextToIPFS(snapshot.ciphertext);
    latestCid = upload.cid;
    const ipfsMeta: BackupSnapshotMetadata = {
      source: upload.source,
      cid: upload.cid,
      ciphertextHash: snapshot.ciphertextHash,
      profileVersion,
      updatedAt: now,
      durable: upload.durable,
      status: upload.status,
    };
    index.snapshots = mergeSnapshot(index.snapshots, ipfsMeta);
  }

  const preferredSource: BackupStore = index.snapshots.some(
    (item) => item.source === "ipfs" && item.durable && item.status === "ok",
  )
    ? "ipfs"
    : "local";

  index.preferredSource = preferredSource;
  index.lastSyncedAt = now;
  await saveBackupIndex({
    preferredSource,
    snapshots: index.snapshots,
    lastSyncedAt: now,
  });

  const status: BackupStatus = {
    preferredSource,
    lastSyncedAt: now,
    snapshots: index.snapshots,
    diverged: hasDivergence(index.snapshots),
  };

  return { preferredSource, status, latestCid };
}

export async function getRestoreCandidates(): Promise<BackupCandidate[]> {
  const candidates: BackupCandidate[] = [];
  const local = await loadLocalBackupSnapshot();
  if (local) {
    candidates.push({
      source: "local",
      profile: local.profile,
      metadata: local.metadata,
    });
  }

  const index = await loadBackupIndex();
  const ipfsSnapshot = index?.snapshots
    .filter((item) => item.source === "ipfs" || item.source === "temporary")
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (ipfsSnapshot?.cid) {
    const walletKey = await getStoredWalletKey();
    if (walletKey) {
      try {
        const ciphertext = await fetchCiphertextFromCid(ipfsSnapshot.cid);
        const profile = (await decrypt(ciphertext, walletKey)) as SovereignProfile;
        candidates.push({
          source: ipfsSnapshot.source,
          profile,
          metadata: ipfsSnapshot,
        });
      } catch {
        // Keep local restore available even when network or session fallback CID is unavailable.
      }
    }
  }

  return candidates;
}
