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
- **Blockchain layer**: Midnight Compact (latest v0.28+) for private logic + Mesh SDK (`@meshsdk/midnight-setup` or equivalent) for client-side integration. Anchor public attestations on Cardano when useful.
- **Identity foundation**: did:midnight + ZK-selective-disclosure Verifiable Credentials.
- **Minimal dependencies**: Keep `package.json` under ~12 direct dependencies total.

## Folder Structure (Maintain This Strictly)
SovereignLink/
├── .github/
│   └── copilot-instructions.md     # This file
├── .devcontainer/
│   └── devcontainer.json
├── contracts/                      # All .compact source files
│   ├── user-vault.compact
│   ├── sharing-feed.compact
│   └── build/                      # Compiled .zk + artifacts (add to .gitignore)
├── src/
│   ├── components/                 # Lit web components (client islands)
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   └── index.astro             # Main dashboard
│   ├── lib/
│   │   ├── mesh.ts                 # Mesh SDK + wallet helpers
│   │   ├── did.ts                  # DID + VC helpers
│   │   └── storage.ts              # Encrypted local profile/session storage (Phase 1)
│   └── styles/
│       └── global.css              # Open Props + project tokens
├── astro.config.mjs
├── netlify.toml                    # Netlify build config
├── package.json
└── README.md

## Development Cycle & Workflow (Strictly Follow This)
1. **All development happens in GitHub Codespaces**:
   - Open repo in Codespaces (devcontainer auto-sets up Node 22, Compact CLI, dependencies).
   - Use GitHub Copilot (chat + inline) for all code generation, refactoring, and debugging.
   - Work on feature branches (`feat/wallet-connect`, `feat/user-vault`, etc.).

2. **Local iteration**:
   - Run `npm run dev` → Astro dev server on port 4321.
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

## Phase 1 – Foundation (Current Priority)
- Astro + Lit + Open Props skeleton with static output
- Midnight Compact toolchain + first contracts (in progress)
- Wallet connection with deterministic did:midnight derivation (implemented)
- Encrypted local Tier 0 profile + 24h encrypted session persistence (implemented)
- Basic user-vault contract integration (next)

## Current Phase 1 Status (April 2026)
- `WalletConnect.ts` now handles CIP-30 scan/retry, connect, DID derivation, encrypted profile bootstrap, and logout/session restore.
- `storage.ts` is the minimal browser-only sovereign vault (`sovereignlink-vault` / `profiles`) using Web Crypto + IndexedDB.
- Session persistence is zero-cost and local-only: no backend, no cookie auth, no on-chain transaction required.
- Profile persistence is local-first: alias/bio remain encrypted in IndexedDB across logout/login for the same DID, while logout clears only session/auth state.
- `ipfs.ts` adds lightweight encrypted profile sharing: payload is encrypted client-side, upload attempts public IPFS add endpoints, and only CID is persisted in local encrypted profile data.
- Browser CORS can block direct public IPFS uploads in Codespaces/preview origins; current baseline includes a temporary session-only encrypted fallback CID for demo continuity.
- Keep comments explicit about sovereignty/privacy/zero-cost constraints in any auth or storage flow.

## Phase 2 – Core Features
- Private storage UI (shielded JSON blobs)
- Selective-disclosure proof generation & sharing
- Minimal sharing feed (bulletin-board style)

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
- Public gateways like `ipfs.io` often reject browser POST `/api/v0/add` requests due to ACAO/CORS limits; this is expected in many preview origins.
- Keep upload flow lightweight and browser-first: try relay/direct upload first, then fall back to temporary session-only encrypted storage if blocked.
- Temporary fallback CIDs must be clearly labeled as local-only and ephemeral (cleared on logout/session end), not durable public IPFS content.
- For durable uploads, migrate to user-provided authenticated pinning (`Pinata` / `nft.storage`) or same-origin function proxy.

### Decorator compatibility in this repo
- Prefer explicit custom element registration (`customElements.define`) over `@customElement` if parser/runtime issues appear in dev.
- Prefer `static properties` + `declare` + constructor initialization for reactive state when decorator transforms are unavailable.

### Button/event wiring in Lit
- Lit's `@click=${handler}` template binding can silently fail to attach during hydration in some Astro build paths.
- Use `firstUpdated()` with `getElementById` + `addEventListener` as a reliable fallback. Store named handlers as class arrow functions to allow proper `removeEventListener` cleanup in `disconnectedCallback`.

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
