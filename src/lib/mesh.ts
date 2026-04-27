/**
 * SovereignLink Phase 2 Mesh helpers (starter).
 * Local devnet = zero cost. Testnet = faucet tNIGHT. Mainnet later.
 */

export const MIDNIGHT_ENV = {
  LOCAL_DEVNET: "local-devnet",
  TESTNET: "testnet",
  MAINNET: "mainnet",
} as const;

export type MidnightEnv = (typeof MIDNIGHT_ENV)[keyof typeof MIDNIGHT_ENV];

type Cip30WalletApi = {
  submitTx?: (tx: string) => Promise<string>;
};

export type StorePrivateDataTx = {
  kind: "midnight-compact-call";
  circuit: "storePrivateData";
  args: {
    did: string;
    dataCommitment: string;
  };
  environment: MidnightEnv;
  zeroCostLocalDevnet: boolean;
};

type Cip30Provider = {
  enable: () => Promise<Cip30WalletApi>;
};

type CardanoWindow = Window & {
  cardano?: Record<string, Cip30Provider | undefined>;
};

export type MidnightWalletSession = {
  walletName: string;
  api: Cip30WalletApi;
  environment: MidnightEnv;
};

let activeWalletSession: MidnightWalletSession | null = null;

function resolveMidnightEnv(value: string | undefined): MidnightEnv {
  if (value === MIDNIGHT_ENV.TESTNET || value === MIDNIGHT_ENV.MAINNET) {
    return value;
  }

  return MIDNIGHT_ENV.LOCAL_DEVNET;
}

export const ACTIVE_MIDNIGHT_ENV: MidnightEnv = resolveMidnightEnv(
  import.meta.env.PUBLIC_MIDNIGHT_ENV,
);

function getCip30Providers(): Record<string, Cip30Provider | undefined> {
  if (typeof window === "undefined") {
    return {};
  }

  return (window as CardanoWindow).cardano ?? {};
}

function getAvailableWalletNames(): string[] {
  const providers = getCip30Providers();
  return Object.keys(providers).filter((name) => typeof providers[name]?.enable === "function");
}

/**
 * Connect a Midnight-capable CIP-30 wallet (Lace or compatible provider).
 * Reuses WalletConnect.ts style provider detection and keeps SSR-safe guards.
 */
export async function connectMidnightWallet(
  preferredWallet?: string,
): Promise<MidnightWalletSession> {
  if (typeof window === "undefined") {
    throw new Error("Wallet connection is browser-only");
  }

  const wallets = getAvailableWalletNames();
  if (!wallets.length) {
    throw new Error("No CIP-30 wallet detected");
  }

  const rememberedWallet = activeWalletSession?.walletName;
  const walletName =
    (preferredWallet && wallets.includes(preferredWallet) && preferredWallet) ||
    (rememberedWallet && wallets.includes(rememberedWallet) && rememberedWallet) ||
    wallets.find((name) => name.toLowerCase().includes("lace")) ||
    wallets[0];
  const provider = getCip30Providers()[walletName];

  if (!provider) {
    throw new Error("Selected wallet provider unavailable");
  }

  const api = await provider.enable();

  activeWalletSession = {
    walletName,
    api,
    environment: ACTIVE_MIDNIGHT_ENV,
  };

  return activeWalletSession;
}

/**
 * Local devnet stays zero-cost by preparing a Compact circuit payload client-side first.
 * Testnet/mainnet can replace this payload with a full Mesh builder later.
 */
export async function buildStorePrivateDataTx(
  did: string,
  dataCommitment: string,
): Promise<StorePrivateDataTx> {
  if (typeof window === "undefined") {
    throw new Error("Transaction building is browser-only in this starter template");
  }

  return {
    kind: "midnight-compact-call",
    circuit: "storePrivateData",
    args: {
      did,
      dataCommitment,
    },
    environment: ACTIVE_MIDNIGHT_ENV,
    zeroCostLocalDevnet: ACTIVE_MIDNIGHT_ENV === MIDNIGHT_ENV.LOCAL_DEVNET,
  };
}

/**
 * Local devnet zero-cost flow: prepare the Compact call and submit through the wallet if available.
 * If the wallet cannot submit yet, keep a deterministic stub so the Phase 2 UI remains testable.
 */
export async function submitTx(tx: StorePrivateDataTx): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Transaction submission is browser-only in this starter template");
  }

  // Phase 2 starter: this payload is not a CBOR tx body yet, so do not call CIP-30 submitTx.
  // CIP-30 submitTx expects CBOR hex and will fail to decode JSON payloads.
  if (tx.kind === "midnight-compact-call") {
    const mockTxHash = `stub-tx-${Date.now()}`;
    // eslint-disable-next-line no-console
    console.log(
      "Zero-cost local devnet stub: storePrivateData prepared, awaiting Mesh builder integration",
      {
        environment: ACTIVE_MIDNIGHT_ENV,
        zeroCostLocalDevnet: tx.zeroCostLocalDevnet,
        tx,
        mockTxHash,
      },
    );
    return mockTxHash;
  }

  const serializedTx = JSON.stringify(tx);
  const walletApi = activeWalletSession?.api;

  if (walletApi?.submitTx) {
    return walletApi.submitTx(serializedTx);
  }

  throw new Error("Wallet submitTx unavailable for this transaction payload");
}
