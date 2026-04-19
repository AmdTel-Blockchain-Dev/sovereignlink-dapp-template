# SovereignLink dApp Template – Copilot Development Instructions

## Project Overview
We are building **SovereignLink**: a minimal Astro + Lit web component template for sovereign identity, private storage, and selective data sharing on **Midnight** (Cardano's privacy partner chain, mainnet live since March 2026) + Cardano.

Core goals:
- Users log in with their **did:midnight** via wallet (Lace or any Midnight-enabled wallet)
- Private per-user storage using Midnight Compact contracts (shielded state + ZK-selective disclosure)
- Secure peer-to-peer data sharing with ZK proofs
- Everything stays client-side where possible — no backend server
- Codebase must remain as small and lightweight as possible

## Core Design Principles (Always Follow These)
- **Astro-first**: Use Astro pages, layouts, and islands for everything possible. Prefer static output (`output: 'static'` in astro.config.mjs) for fastest deploys.
- **Lit only for interactive components**: WalletConnect, ProfileCard, ShareModal, SharedFeed, etc. Keep each under ~150 lines.
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
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   └── index.astro             # Main dashboard
│   ├── lib/
│   │   ├── mesh.ts                 # Mesh SDK + wallet helpers
│   │   ├── did.ts                  # DID + VC helpers
│   │   └── contracts.ts            # Contract calls & proofs
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
- Midnight Compact toolchain + first contracts
- Wallet connection with did:midnight + ZK proof
- Basic user-vault contract integration

## Phase 2 – Core Features
- Private storage UI (shielded JSON blobs)
- Selective-disclosure proof generation & sharing
- Minimal sharing feed (bulletin-board style)

## Phase 3 – Polish & Production
- Optional Qwik island only if needed
- Cardano anchoring for public attestations
- Full testnet → mainnet guide
- GitHub Actions (optional CI for contract compilation)

## Key Resources
- Midnight Docs & Compact: https://docs.midnight.network/
- Mesh SDK for Midnight: https://meshjs.dev/midnight
- Astro + Netlify: https://docs.astro.build/en/guides/deploy/netlify/
- Open Props: https://open-props.style/

When implementing any change:
- Keep it minimal and aligned with principles
- Use clean Open Props variables
- Include comments explaining the privacy/sovereign aspect
- Confirm which phase/step we are on in your response

Let's keep SovereignLink the cleanest, smallest, and most privacy-preserving Midnight + Cardano identity template.

Start every response with a short confirmation of the current phase/step and workflow status.
