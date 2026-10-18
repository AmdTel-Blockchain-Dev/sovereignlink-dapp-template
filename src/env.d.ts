/// <reference types="astro/client" />

interface ImportMetaEnv {
  // IPFS API upload endpoint (POST /api/v0/add)
  readonly PUBLIC_IPFS_API: string;
  // IPFS read gateway (GET /ipfs/<cid>)
  readonly PUBLIC_IPFS_GATEWAY: string;
  // Midnight environment: local-devnet | testnet | mainnet
  readonly PUBLIC_MIDNIGHT_ENV: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
