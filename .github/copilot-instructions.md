# SovereignLink dApp Template – Copilot Development Instructions

## Project Overview

We are building **SovereignLink**: a minimal Astro + Lit web component template for sovereign identity, private storage, and selective data sharing on **Midnight** (Cardano's privacy partner chain, mainnet live since March 2026) + Cardano.

Core goals:

- Users log in with their **did:midnight** via wallet (Lace or any Midnight-enabled wallet)
- Private per-user storage starts client-side (encrypted browser vault), then expands to Midnight Compact contracts
- Secure peer-to-peer data sharing with ZK proofs
- Everything stays client-side where possible — no backend server
- Codebase must remain as small and lightweight as possible

## Core Design Principles (Always Follow These)

- **Astro-first**: Use Astro pages, layouts, and islands for everything possible. Prefer static output (`output: 'static'` in astro.config.mjs) for fastest deploys.
- **Lit only for interactive components**: WalletConnect, ProfileCard, ShareModal, SharedFeed, etc. Keep components compact and split helpers when one file grows past ~220 lines.
- **No heavy frameworks**: Avoid React, Vue, Svelte. Consider Qwik only later for real-time feed if Lit reactivity becomes limiting.
- **Styling**: Use **CSS Open Props** exclusively (`@import "open-props/style";` in global.css). No Tailwind or utility-class clutter. Use semantic custom properties (`var(--surface-1)`, `var(--size-4)`, etc.) directly in Lit `<style>` or global CSS.
- **Blockchain layer**: Midnight Compact for private logic + Mesh SDK (`@meshsdk/core` or latest lightweight official Midnight package) for client-side integration. Anchor public attestations on Cardano when useful.
- **Identity foundation**: did:midnight + ZK-selective-disclosure Verifiable Credentials.
- **Minimal dependencies**: Keep `package.json` under ~12 direct dependencies total.

## Folder Structure (Maintain This Strictly)

SovereignLink/
├── .github/
│ └── copilot-instructions.md # This file
├── .devcontainer/
│ └── devcontainer.json
├── contracts/ # All .compact source files
│ ├── user-vault.compact
│ ├── sharing-feed.compact
│ └── build/ # Compiled .zk + artifacts (add to .gitignore)
├── src/
│ ├── components/ # Lit web components (client islands)
│ ├── layouts/
│ │ └── Layout.astro
│ ├── pages/
│ │ └── index.astro # Main dashboard
│ ├── lib/
│ │ ├── mesh.ts # Mesh SDK + wallet helpers
│ │ ├── did.ts # DID + VC helpers
│ │ ├── storage.ts # Encrypted local profile/session/backup storage
│ │ ├── ipfs.ts # IPFS encrypted upload with localhost-safe fallback
│ │ └── backup.ts # Multi-store backup orchestration (IPFS primary + local fallback)
│ └── styles/
│ └── global.css # Open Props + project tokens
├── astro.config.mjs
├── netlify.toml # Netlify build config
├── package.json
└── README.md

## Development Cycle & Workflow (Strictly Follow This)

1. **All development happens in GitHub Codespaces**:
   - Open repo in Codespaces (devcontainer auto-sets up Node 22, Compact CLI, dependencies).
   - Use GitHub Copilot (chat + inline) for all code generation, refactoring, and debugging.
   - Work on feature branches (`feat/wallet-connect`, `feat/user-vault`, etc.).

2. **Local iteration**:

- Run `pnpm run dev` (or `npm run dev`) → Astro dev server on port 4321.
- Compile Compact contracts locally with `compact compile`.
- Test wallet interactions against Midnight Preview / local testnet first.

3. **Commit & Push**:
   - Small, focused commits.
   - Always format with Biome on save.
   - Push branch → GitHub.

4. **Preview & Testing**:
   - Netlify automatically creates **Deploy Previews** for every branch/PR (instant public URLs with latest code).
   - Test sovereign login, private storage, and selective sharing in the preview.

5. **Deployment to Public**:
   - Merge to `main` → Netlify automatically deploys to production.
   - No manual steps required after initial Netlify setup.

6. **Contract Changes**:
   - Always compile Compact files before committing.
   - Keep compiled artifacts minimal and documented.

This workflow keeps feedback loops extremely fast, costs near-zero, and maintains full sovereignty/privacy focus.

## Netlify Setup (One-Time)

- Connect the GitHub repo to a new Netlify site (import from GitHub).
- Netlify auto-detects Astro → Build command: `npm run build`, Publish directory: `dist`.
- Add `netlify.toml` at root for explicit control (see below).
- Enable branch deploys for all branches or PRs.

## Phase 1 – Foundation (COMPLETE ✓ – April 2026)

- ✅ Astro + Lit + Open Props skeleton with static output
- ✅ Midnight Compact toolchain + first contracts (`user-vault.compact` compiled and stub-wired)
- ✅ Wallet connection with deterministic `did:midnight` derivation (CIP-30, zero-cost)
- ✅ Encrypted local Tier 0 profile + 24h encrypted session persistence (IndexedDB + Web Crypto)
- ✅ IPFS encrypted profile sharing with session-only fallback CID
- ✅ `SovereignProfile` component with edit, save, IPFS share, and Phase 2 vault upgrade stub
- ✅ Biome formatting, Netlify deploy config, and devcontainer setup

## Current Phase 1 Status (April 2026)

- `WalletConnect.ts` now handles CIP-30 scan/retry, connect, DID derivation, encrypted profile bootstrap, and logout/session restore.
- `storage.ts` is the minimal browser-only sovereign vault (`sovereignlink-vault` / `profiles`) using Web Crypto + IndexedDB.
- Session persistence is zero-cost and local-only: no backend, no cookie auth, no on-chain transaction required.
- Profile persistence is local-first: alias/bio remain encrypted in IndexedDB across logout/login for the same DID, while logout clears only session/auth state.
- `ipfs.ts` adds lightweight encrypted profile sharing: payload is encrypted client-side, upload attempts public IPFS add endpoints, and only CID is persisted in local encrypted profile data.
- Browser CORS can block direct public IPFS uploads in Codespaces/preview origins; current baseline includes a temporary session-only encrypted fallback CID for demo continuity.
- Keep comments explicit about sovereignty/privacy/zero-cost constraints in any auth or storage flow.

## Phase 2 – Core Features (IN PROGRESS)

- ✅ Dashboard UI polish in `index.astro` with ordered card flow:
  1. Header (title + theme toggle + wallet status)
  2. Sovereign Profile (with Logout button)
  3. Private Vault Status (with backup source-of-truth indicators)
  4. Quick Share / Selective Disclosure stub
  5. Shared Feed stub (Phase 2.5 placeholder)
- ✅ Open Props-only light/dark theme tokens in `global.css` + no-flash local theme bootstrap in `Layout.astro`
- ✅ Client-side dashboard state sync via `wallet-connected`, `wallet-disconnected`, `profile-ready`, `sovereign-profile-updated`, and `backup-status-updated`
- ✅ `SovereignProfile.ts` now persists and emits vault upgrade metadata (`vaultTier`, `lastCommitment`, `lastUpgradeTx`, `lastUpgradeStatus`)
- ✅ Shielded UX state: hide upgrade CTA after success and show `Shielded on Midnight ✓` badge
- ✅ **Conditional dashboard UI**: only Wallet Status card shown when logged out; profile/vault/feed cards revealed on connect; WalletConnect hides on login
- ✅ **Logout button in SovereignProfile**: dispatches `logout-requested` event; WalletConnect handles session clear and dispatches `wallet-disconnected`
- ✅ **Multi-store encrypted backup** (`src/lib/backup.ts`): IPFS preferred, local IndexedDB fallback, ciphertext-hash divergence detection, snapshot index (max 12 entries)
- ✅ **Backup sync triggers**: on every profile save, on wallet connect, and on session restore
- ✅ **Manual Sync Now + Restore from Backup** actions in SovereignProfile with source selection when diverged
- ✅ **Backup status indicators** in vault card: Backup Source of Truth, Divergence, Last Backup Sync
- ✅ **IPFS CORS guard**: localhost/127.0.0.1 with `ipfs.io` gateway skips network upload immediately and uses encrypted session fallback

Remaining Phase 2 feature work:

- Private storage UI: shielded JSON blobs stored via `user-vault.compact` (requires small NIGHT balance for on-chain tx)
- ZK selective-disclosure proof generation & sharing (Midnight Compact circuits)
- Minimal sharing feed via `sharing-feed.compact` (bulletin-board style, verifiable attestations)
- `ShareModal` Lit component for per-field selective disclosure
- Durable IPFS: replace session fallback with same-origin Netlify function proxy or authenticated Pinata/nft.storage
- Optional: Cardano anchoring for public attestations cross-chain

## Current Phase 2 UI Status (June 2026)

- `global.css` uses Open Props primitives + project aliases (`--color-*`, `--sl-*`) with `[data-theme="dark"]` overrides only.
- Theme preference is local-only (`localStorage` key: `sovereignlink-theme`) and initialized in `Layout.astro` before paint.
- `index.astro` shows only the Wallet Status card (with WalletConnect component) when logged out. All other cards are inside `<div id="logged-in-cards">` with `display: none` initially, revealed to `display: contents` on `wallet-connected` and hidden again on `wallet-disconnected`.
- WalletConnect component is wrapped in `<div id="wallet-connect-card">` and hidden on connect, shown again on disconnect.
- Logout button lives in SovereignProfile's actions row; clicking it dispatches `logout-requested` (bubbles), WalletConnect handles session clear and dispatches `wallet-disconnected`.
- Vault status card reads from encrypted local profile data and reflects live upgrades and backup sync state without backend polling.
- Backup status indicators in vault card: **Backup Source of Truth** (IPFS primary / Local fallback / Session fallback), **Backup Divergence** (Aligned / Needs manual restore choice), **Last Backup Sync** (locale time string).
- All dashboard UX state remains client-side; no tracking, no server persistence, and no identity linkage for theme or layout state.

## Phase 3 – Polish & Production

- Optional Qwik island only if needed
- Cardano anchoring for public attestations
- Full testnet → mainnet guide
- GitHub Actions (optional CI for contract compilation)

## Lit + Astro Integration: Learned Patterns (DO NOT REPEAT THESE MISTAKES)

### How to wire a Lit component in Astro (the correct way)

- **Do NOT use `<MyComponent client:load />`** with Astro's Lit integration for self-registering custom elements.
  That path server-renders the component, so `connectedCallback`, `firstUpdated`, and browser lifecycle hooks never fire properly.
- **Correct pattern**: render the raw HTML tag and import the module as a client script:
  ```astro
  <wallet-connect></wallet-connect>
  <script>
    import "../components/WalletConnect.ts";
  </script>
  ```
- If lifecycle issues appear, prefer the raw-tag + script-import pattern first and avoid introducing mixed hydration approaches.

### Lit reactive property declarations

- **Do NOT use plain class field syntax** (`status = "Disconnected"`) for reactive Lit properties. TypeScript emits native class fields that shadow Lit's reactive accessors, silently breaking all reactivity and rerenders.
- **Do NOT use `accessor`** keyword — not supported by the current Astro/Vite/TypeScript pipeline.
- **Correct pattern**: use `declare` for property type annotations and initialize values in the constructor:
  ```ts
  declare status: string;
  constructor() {
    super();
    this.status = "Disconnected";
  }
  ```

### CIP-30 wallet detection

- `window.cardano` providers are injected by extensions **after** initial page load. A one-shot scan in `connectedCallback` will miss them.
- Scan with retries: run `_scanForWallets()` on `connectedCallback`, then again at 300ms and 1000ms via `setTimeout`, and poll via `setInterval` until wallets are found.
- Also re-scan on `window focus` and `window load` events to handle wallet extension toggling.
- Filter providers by checking `typeof provider.enable === "function"` — some keys on `window.cardano` are not full CIP-30 providers.

### SSR boundary

- Always guard `window` access: `if (typeof window === "undefined") return {};`
- Never call `window.cardano` from outside a browser lifecycle hook or a `window`-guarded getter — Astro SSR will throw `window is not defined`.
- For storage/session methods, guard browser APIs early: `if (typeof window === "undefined") return null/false;`.

### Web Crypto + TypeScript gotcha (important)

- In strict TS DOM libs, `Uint8Array<ArrayBufferLike>` may fail `BufferSource` checks for `crypto.subtle.*`.
- Normalize to a guaranteed `ArrayBuffer` before `importKey`/`decrypt` calls to avoid recurring type errors.
- Keep this helper local and minimal instead of adding crypto dependencies.

### Session and logout pattern (current baseline)

- Session token payload: `{ did, iat, exp }` with 24h expiry, encrypted client-side with the same wallet-derived key material.
- Persist session in the same IndexedDB object store using a fixed id (`session`) for simple restore.
- On `connectedCallback`/`firstUpdated`, validate session and restore profile state before forcing wallet re-enable.
- On reconnect, load existing profile first and only create a default profile when no matching DID record exists.
- Logout must clear only local session/auth state and dispatch `wallet-disconnected`; encrypted profile data remains local for next login with the same wallet DID.

### IPFS upload in browser-constrained environments

- `ipfs.io/api/v0/add` rejects browser POST from localhost and most preview origins due to CORS. Do NOT try relay services like `cors.isomorphic-git.org` — also blocked.
- Guard uploads with `shouldUseSessionFallbackOnly(gateway)`: if `window.location.hostname` is localhost/127.0.0.1 and gateway contains `ipfs.io`, skip network entirely and use encrypted session fallback.
- Temporary fallback CIDs use prefix `temp-session-` and are stored in `sessionStorage` with key prefix `sovereignlink-temp-ipfs:`. They are cleared on logout via `clearTemporaryIPFSCache()`.
- `isTemporaryCID(cid)` and `resolveCID(cid)` handle both real and session fallback CIDs consistently.
- For durable uploads, migrate to a same-origin Netlify function proxy or authenticated Pinata/nft.storage API key held by the user.

### Decorator compatibility in this repo

- Prefer explicit custom element registration (`customElements.define`) over `@customElement` if parser/runtime issues appear in dev.
- Prefer `static properties` + `declare` + constructor initialization for reactive state when decorator transforms are unavailable.

### Button/event wiring in Lit

- Lit's `@click=${handler}` template binding can silently fail to attach during hydration in some Astro build paths.
- Use `firstUpdated()` with `getElementById` + `addEventListener` as a reliable fallback. Store named handlers as class arrow functions to allow proper `removeEventListener` cleanup in `disconnectedCallback`.
- If listeners are attached in `firstUpdated()`, avoid conditionally creating/removing those target elements later in render. Prefer keeping controls in the DOM and toggling `hidden`/`disabled` for reliable wiring.

### Multi-store backup pattern (Phase 2 baseline)

- `src/lib/backup.ts` is the single entry point for backup orchestration. Never call `uploadCiphertextToIPFS` or `saveLocalBackupSnapshot` directly from components.
- Sync flow: `syncProfileBackups(profile)` → creates encrypted snapshot (ipfsCid stripped) → writes local backup record → uploads to IPFS (or session fallback if localhost) → updates `BackupIndexRecord` (max 12 snapshots, sorted newest-first).
- Divergence is detected by comparing `ciphertextHash` of latest local and IPFS snapshots. If hashes differ, `BackupStatus.diverged = true`.
- Restore flow: `getRestoreCandidates()` loads local snapshot + fetches IPFS snapshot payload; component prompts user choice when diverged.
- All backup records stored in same IndexedDB `sovereignlink-vault/profiles` store under keys `backup-local` and `backup-index`.
- Preferred source auto-upgrades to `"ipfs"` when a durable IPFS snapshot exists; falls back to `"local"` otherwise.
- Emit `backup-status-updated` event (bubbles, composed) from components after every sync so dashboard can reflect current state without polling.

### Logout event flow (current baseline)

- Logout button in `SovereignProfile` dispatches `logout-requested` (bubbles: true, composed: true) — it does NOT directly clear session or dispatch `wallet-disconnected`.
- `WalletConnect` listens on `window` for `logout-requested`, calls its own `logout()` method which clears IndexedDB session record, resets component state, and dispatches `wallet-disconnected`.
- `SovereignProfile` hears `wallet-disconnected` via its existing `_onWalletDisconnected` handler and clears profile state.
- This one-way flow prevents double-firing of `wallet-disconnected`.
- `SovereignProfile` does NOT have its own `logout()` method — state clearing is fully handled by `_onWalletDisconnected`.

### Conditional dashboard visibility pattern

- Wrap all logged-in cards in `<div id="logged-in-cards" style="display: none;">` — use `display: contents` when revealed so children participate normally in the CSS grid.
- Wrap `<wallet-connect>` in `<div id="wallet-connect-card">` — hide it on `wallet-connected`, show on `wallet-disconnected`.
- Never conditionally render the Lit component tags themselves; only toggle the wrapper container visibility. This keeps Lit lifecycle hooks stable.

### Phase 2 zero-cost testing setup

- Default environment for starter dev should be local devnet (`PUBLIC_MIDNIGHT_ENV=local-devnet`) to keep testing zero-cost.
- Environment policy: local devnet = zero cost, testnet = faucet-funded tNIGHT, mainnet later.
- Keep Mesh dependencies minimal and installable: prefer published lightweight packages (current baseline: `@meshsdk/core`).
- If TypeScript reports `Property 'env' does not exist on type 'ImportMeta'`, add `src/env.d.ts` with `/// <reference types="astro/client" />`.
- If Compact compile reports a language mismatch, align `pragma language_version` in `.compact` files with the local installed `compact` CLI version.

## Learned Patterns – Login & Storage

### Session token persistence

- Token payload: `{ did, iat, exp }` with 24h expiry.
- Encrypted client-side with wallet-derived key material and stored in the same IndexedDB store as the profile (key: `session`).
- On component mount, decrypt and validate `exp`; restore profile state without forcing wallet re-enable.
- On logout, delete only the session record; profile remains encrypted locally for the next login with the same DID.

### DID derivation from CIP-30 wallet

- Call `wallet.getUsedAddresses()` (fallback `getUnusedAddresses()`), take the first address.
- Derive: `did:midnight:<sha256hex(firstAddress)>` — deterministic, zero-cost, no on-chain transaction.
- Store the raw wallet key (base64) in IndexedDB `profiles` for later encryption/decryption operations.
- Never log or expose raw key material beyond the encrypted store.

### IPFS encrypted profile sharing

- Encrypt payload client-side with Web Crypto AES-GCM before any upload attempt.
- Upload to a public IPFS add endpoint (e.g. `https://ipfs.io/api/v0/add`).
- If CORS blocks the upload (common in Codespaces/preview origins), fall back to a temporary session-only encrypted CID (`tmp:...`) that is cleared on logout.
- Only persist the CID in the local encrypted profile — never raw payload.
- For durable uploads, migrate to authenticated pinning (Pinata / nft.storage) or a same-origin Netlify function proxy.

### Correct Lit patterns (reuse these)

```ts
// ✅ Reactive property — use declare + constructor, NOT plain class fields
declare status: string;
constructor() { super(); this.status = "Disconnected"; }

// ✅ Event listeners — wire in firstUpdated, clean up in disconnectedCallback
override firstUpdated() {
  window.addEventListener("wallet-connected", this._onConnect);
}
override disconnectedCallback() {
  window.removeEventListener("wallet-connected", this._onConnect);
  super.disconnectedCallback();
}

// ✅ Astro integration — raw tag + script import
// <sovereign-profile></sovereign-profile>
// <script>import "../components/SovereignProfile.ts";</script>
// Do NOT use <SovereignProfile client:load /> — lifecycle hooks won't fire.
```

### Sovereignty/privacy comment templates

```ts
// Sovereign: DID derived client-side from wallet address — no central authority, no server.
// Zero-cost: session is encrypted locally; no on-chain transaction required for login.
// Private vault: profile data encrypted with wallet-derived key; only CID stored if shared via IPFS.
// Phase 2 bridge: Midnight user-vault.compact will replace local Tier 0 with ZK-protected on-chain storage.
```

## Key Resources

- Midnight Docs & Compact: https://docs.midnight.network/
- Mesh SDK for Midnight: https://meshjs.dev/midnight
- Astro + Netlify: https://docs.astro.build/en/guides/deploy/netlify/
- Open Props: https://open-props.style/

When implementing any change:

- Keep it minimal and aligned with principles
- Use clean Open Props variables
- Include comments explaining the privacy/sovereign aspect
- Reuse successful patterns from `WalletConnect.ts` + `storage.ts` before inventing new auth/storage flows
- Prefer fixes that reduce repeated TS/Web Crypto typing regressions
- Confirm which phase/step we are on in your response

Let's keep SovereignLink the cleanest, smallest, and most privacy-preserving Midnight + Cardano identity template.

Start every response with a short confirmation of the current phase/step and workflow status.
