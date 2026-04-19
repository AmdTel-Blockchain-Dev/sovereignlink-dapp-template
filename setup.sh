#!/usr/bin/env bash
# Run this once after the devcontainer starts to finalise the project setup.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "📦  Installing dependencies..."
npm install

echo "🔍  Verifying Astro..."
npx astro --version

echo "📝  Committing skeleton..."
git add -A
git commit -m "Initial Astro + Lit + Open Props skeleton (no Tailwind)"

echo "✅  Done! Run: npm run dev"
