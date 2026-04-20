# SovereignLink – Minimal Astro + Lit + Midnight dApp Template

Self-sovereign identity and private storage on **Midnight** (Cardano's privacy chain) with zero-cost public profile and optional IPFS sharing.

- **No server. No backend. No vendor lock-in.**
- DID derived client-side from your wallet — no on-chain transaction required for basic login.
- All profile data encrypted locally in your browser (IndexedDB + Web Crypto AES-GCM).
- Optional IPFS sharing — only the CID is persisted; raw payload never leaves your device unencrypted.
- Private vault upgrade (Phase 2) uses Midnight Compact shielded contracts — opt-in, requires small NIGHT balance.

---

## Quick Start (GitHub Codespaces)

1. Open the repo in GitHub Codespaces (devcontainer auto-installs Node 22, Compact CLI, and dependencies).
2. Install dependencies and start the dev server:
   ```bash
   pnpm install && pnpm run dev
   ```
3. Open the forwarded port **4321** in your browser.
4. Install [Lace wallet](https://www.lace.io/) (or any Midnight-enabled CIP-30 wallet) in your browser.
5. Click **Connect Wallet** — your `did:midnight` is derived automatically, zero-cost.
6. Edit your alias and bio, then click **Save**.
7. Click **Share via IPFS** to encrypt your public profile and attempt an IPFS upload.
   - In Codespaces/preview origins, a temporary session-only fallback CID is used if CORS blocks direct upload.

---

## Sovereignty Explained

| Concern | How SovereignLink handles it |
|---|---|
| **Identity** | `did:midnight:<sha256(walletAddress)>` — derived from your key, not issued by a server |
| **Login cost** | Zero — session is encrypted locally; no on-chain transaction required |
| **Profile storage** | AES-GCM encrypted in your browser's IndexedDB — no server ever sees plaintext |
| **IPFS sharing** | Payload encrypted client-side before upload; only CID stored in local profile |
| **Private vault** | Phase 2: Midnight `user-vault.compact` shielded contract — ZK-protected, opt-in |

---

## Folder Structure

```
sovereignlink-dapp-template/
├── .github/
│   └── copilot-instructions.md   # Copilot dev instructions + learned patterns
├── .devcontainer/
│   └── devcontainer.json
├── contracts/
│   ├── user-vault.compact        # Phase 2: shielded per-user vault (Midnight Compact)
│   └── sharing-feed.compact      # Phase 2: verifiable attestation feed
├── src/
│   ├── components/
│   │   ├── WalletConnect.ts      # CIP-30 wallet scan, DID derivation, session restore
│   │   └── SovereignProfile.ts   # Profile edit, save, IPFS share, vault upgrade stub
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   └── index.astro           # Main dashboard
│   ├── lib/
│   │   ├── storage.ts            # Encrypted IndexedDB vault (Tier 0, Phase 1)
│   │   ├── ipfs.ts               # Client-side encrypted IPFS upload + fallback
│   │   ├── did.ts                # DID + VC helpers
│   │   └── mesh.ts               # Mesh SDK + wallet helpers
│   └── styles/
│       └── global.css            # Open Props + project tokens
├── astro.config.mjs
├── netlify.toml
└── package.json
```

---

## Testing the Flow

1. Open the app (port 4321 in dev, or Netlify preview URL for branches).
2. **Connect wallet**: click "Connect Wallet" → select your CIP-30/Lace wallet → approve connection.
3. **Verify DID**: your `did:midnight:...` appears in the profile card — deterministic, derived from your first wallet address.
4. **Edit profile**: click "Edit" → update alias/bio → click "Save". Refresh — data persists (encrypted locally).
5. **IPFS share**: click "Share via IPFS". A CID appears. If in a CORS-restricted origin, a `tmp:...` fallback CID is shown with a local-only notice.
6. **Logout**: click "Disconnect". Session clears; profile data stays encrypted in IndexedDB for next login.
7. **Reconnect**: click "Connect Wallet" again — alias/bio restore automatically from encrypted local vault.
8. **Vault upgrade (stub)**: click "Upgrade to Private Vault" — console logs the Phase 2 intent. Full on-chain flow comes in Phase 2.

---

## Phase Status

| Phase | Status | Description |
|---|---|---|
| **Phase 1 – Foundation** | ✅ Complete (April 2026) | Astro + Lit skeleton, wallet connect, DID derivation, encrypted local storage, IPFS sharing |
| **Phase 2 – Core Features** | 🔜 Next | Midnight `user-vault.compact` shielded storage, ZK selective disclosure, sharing feed |
| **Phase 3 – Polish** | ⏳ Planned | Cardano anchoring, testnet→mainnet guide, optional CI |

---

## Next: Phase 2 – Midnight Vault Integration

Phase 2 wires the "Upgrade to Private Vault" button to a real Midnight Compact transaction:
- Submit `storePrivateData(did, dataCommitment)` to `user-vault.compact` (requires small NIGHT balance).
- Generate ZK selective-disclosure proofs for per-field sharing.
- Publish verifiable attestations to `sharing-feed.compact`.

See `.github/copilot-instructions.md` for design principles and development workflow.

---

## Key Resources

- [Midnight Network Docs](https://docs.midnight.network/)
- [Mesh SDK for Midnight](https://meshjs.dev/midnight)
- [Open Props](https://open-props.style/)
- [Astro + Netlify Deploy](https://docs.astro.build/en/guides/deploy/netlify/)
