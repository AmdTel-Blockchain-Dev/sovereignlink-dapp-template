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

export const ACTIVE_MIDNIGHT_ENV: MidnightEnv =
  (import.meta.env.PUBLIC_MIDNIGHT_ENV as MidnightEnv | undefined) ?? MIDNIGHT_ENV.LOCAL_DEVNET;

type Cip30Provider = {
  enable: () => Promise<unknown>;
};

type CardanoWindow = Window & {
  cardano?: Record<string, Cip30Provider | undefined>;
};

export type MidnightWalletSession = {
  walletName: string;
  api: unknown;
  environment: MidnightEnv;
};

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

  const walletName = preferredWallet && wallets.includes(preferredWallet) ? preferredWallet : wallets[0];
  const provider = getCip30Providers()[walletName];

  if (!provider) {
    throw new Error("Selected wallet provider unavailable");
  }

  const api = await provider.enable();

  return {
    walletName,
    api,
    environment: ACTIVE_MIDNIGHT_ENV,
  };
}

/**
 * Build a storePrivateData transaction payload stub.
 * TODO(Phase 2): replace this with real @meshsdk/core Midnight tx builder integration.
 */
export async function buildStorePrivateDataTx(did: string, dataCommitment: string): Promise<{
  circuit: "storePrivateData";
  did: string;
  dataCommitment: string;
  environment: MidnightEnv;
}> {
  if (typeof window === "undefined") {
    throw new Error("Transaction building is browser-only in this starter template");
  }

  return {
    circuit: "storePrivateData",
    did,
    dataCommitment,
    environment: ACTIVE_MIDNIGHT_ENV,
  };
}

/**
 * Submit transaction stub.
 * Local devnet = zero cost. Testnet = faucet-funded tNIGHT. Mainnet later.
 */
export async function submitTx(tx: unknown): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Transaction submission is browser-only in this starter template");
  }

  const mockTxHash = `stub-tx-${Date.now()}`;
  // eslint-disable-next-line no-console
  console.log("TODO: submit real Midnight tx via Mesh", { environment: ACTIVE_MIDNIGHT_ENV, tx, mockTxHash });
  return mockTxHash;
}
