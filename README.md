# SovereignLink - Minimal Astro + Lit + Midnight dApp Template

SovereignLink is a privacy-first starter dApp for sovereign identity and local encrypted profile storage.

- No backend server and no centralized auth provider
- Wallet-based identity derived in the browser
- Encrypted local profile/session storage by default
- Optional encrypted IPFS backup/share path with safe local fallback

This README is written for two audiences:

- Average users who want to understand what happens when they connect, refresh, and logout
- Developers/auditors who want exact storage and cryptography details

---

## Quick Start

1. Open this repository in GitHub Codespaces or local dev.
2. Install and run:

```bash
pnpm install
pnpm run dev
```

3. Open port 4321.
4. Install a CIP-30 wallet extension (for example Lace).
5. Click Connect Wallet.

---

## Login and Logout: Plain-English Flow

### Login (Connect Wallet)

1. You click Connect Wallet.
2. The app requests wallet access from the extension.
3. A deterministic did:midnight identifier is derived in-browser from wallet-controlled data.
4. Your profile is loaded from encrypted local storage (or initialized if first login).
5. An encrypted session token is stored locally with a 24-hour expiry.
6. The dashboard switches to logged-in cards.

### Refresh or Navigation While Logged In

1. On page load, the app checks for a valid encrypted session token.
2. If valid and not expired, you stay logged in.
3. The app re-emits connected/profile events so UI state is fully restored.

### Logout

1. You click Logout in the profile card.
2. The app clears the encrypted session record.
3. A local force-logout marker is set so refresh cannot silently restore the old session.
4. The UI switches to logged-out mode (Wallet Status card with Connect Wallet controls).
5. Your encrypted profile remains stored locally for future reconnect with the same wallet.

### After Logout + Refresh

- You remain logged out.
- You must reconnect the wallet to start a new session.

---

## Session Behavior Contract

This is the intended contract enforced by the app:

1. Logged in should survive refresh/navigation.
2. Explicit logout must be authoritative.
3. Logout must not auto-recover session on refresh.
4. Re-login must require wallet connect.

Recent session bugfixes implement this contract in WalletConnect lifecycle and dashboard bootstrap logic.

---

## Where Data Is Stored

All storage is browser-local unless you explicitly use IPFS features.

### IndexedDB

Database name: sovereignlink-vault  
Object store: profiles

Records:

- id: me
   - ciphertext: encrypted profile payload
   - walletKeyB64: wallet-derived key material (base64) used for local cryptography operations
- id: session
   - ciphertext: encrypted session token { did, iat, exp }
- id: backup-local
   - ciphertext: encrypted backup snapshot
   - metadata: source/hash/version/timestamp/durability
- id: backup-index
   - preferred source, last sync time, rolling snapshot metadata list (max 12)

### sessionStorage

Used only for temporary encrypted IPFS fallback payloads when direct IPFS upload is blocked by browser CORS constraints.

- Key prefix: sovereignlink-temp-ipfs:
- CID format: temp-session-...
- Cleared on logout

### localStorage

- sovereignlink-theme: theme preference
- sovereignlink-force-logout: logout guard flag to prevent silent session restoration after explicit logout

No cookies are used for auth.

---

## Encryption and Security Model (In Depth)

### 1. Client-Side-Only Encryption

- Encryption/decryption is done in the browser via Web Crypto API.
- Profile and session data are encrypted before writing to IndexedDB.
- The app never sends plaintext profile/session data to a backend API.

### 2. Key Derivation

The app derives a symmetric AES key from wallet-derived bytes using PBKDF2:

- Algorithm: PBKDF2
- Hash: SHA-256
- Iterations: 120,000
- Salt: sovereignlink-vault:profiles
- Derived key: AES-GCM 256-bit

### 3. Cipher Format

Encrypted blobs are stored as:

- base64(iv).base64(ciphertext)

Where:

- iv is a random 12-byte nonce
- cipher uses AES-GCM authenticated encryption

### 4. DID Derivation

WalletConnect derives a deterministic DID locally using wallet name plus a SHA-256 hash of wallet-provided source material (pub key or change address fallback), producing a did:midnight identifier without server dependency.

### 5. Session Token Security

Session payload includes issued-at and expiry:

- iat: issued timestamp
- exp: expiration timestamp (24h)

On validation failure (expired/invalid), session is cleared.

### 6. Logout Guarantees

Logout now has two controls:

1. Remove session record from IndexedDB.
2. Set force-logout marker to block restore path on refresh.

This prevents edge cases where a quick refresh could previously recreate logged-in state from stale/session race conditions.

---

## Backup and IPFS Behavior

SovereignLink uses a multi-store encrypted backup pattern:

1. Create encrypted profile snapshot (ipfsCid stripped from payload)
2. Save local snapshot (IndexedDB fallback)
3. Attempt IPFS ciphertext upload (preferred)
4. Update backup index metadata and divergence status

If browser/network policy blocks direct IPFS upload (common on localhost with ipfs.io), the app uses encrypted temporary session fallback and marks backup durability accordingly.

Important:

- Only encrypted payload is uploaded
- CID reference is stored in local encrypted profile
- Divergence detection compares ciphertext hash between local and remote snapshots

---

## What Leaves Your Device

By default:

- Nothing required for login besides wallet extension interaction

When you choose IPFS share/backup:

- Encrypted payload and resulting CID interaction with gateway
- No plaintext profile fields should leave the browser

When you choose Midnight vault operations (Phase 2 path):

- Transaction data required for on-chain compact contract execution

---

## Folder Structure (Current)

```
sovereignlink-dapp-template/
├── .github/
│   └── copilot-instructions.md
├── contracts/
│   └── user-vault.compact
├── src/
│   ├── components/
│   │   ├── WalletConnect.ts
│   │   └── SovereignProfile.ts
│   ├── lib/
│   │   ├── storage.ts
│   │   ├── ipfs.ts
│   │   ├── backup.ts
│   │   ├── mesh.ts
│   │   └── did.ts
│   ├── pages/
│   │   └── index.astro
│   ├── layouts/
│   │   └── Layout.astro
│   └── styles/
│       └── global.css
├── astro.config.mjs
├── netlify.toml
└── package.json
```

---

## User Verification Checklist

Use this checklist to validate expected behavior:

1. Connect wallet -> profile card appears, connect button hidden.
2. Refresh page -> still logged in.
3. Logout -> logged-in cards hide, connect button returns.
4. Refresh page immediately after logout -> still logged out.
5. Reconnect wallet -> prior encrypted local profile restores.

---

## Phase Status

- Phase 1: complete
- Phase 2: in progress (backup fabric, conditional dashboard flow, session hardening active)
- Phase 3: planned

---

## Key Resources

- Midnight docs: https://docs.midnight.network/
- Mesh Midnight: https://meshjs.dev/midnight
- Open Props: https://open-props.style/
- Astro Netlify guide: https://docs.astro.build/en/guides/deploy/netlify/
