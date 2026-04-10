#!/usr/bin/env bash
# Build and deploy the Canto web app to Cloudflare Pages.
# Requires: wrangler authenticated (`npx wrangler login`) and a Pages
# project named "canto" (created on first run with --project-name).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_NAME="${CF_PAGES_PROJECT:-canto}"
BRANCH="${CF_PAGES_BRANCH:-main}"

./web/build.sh

echo "==> Deploying dist/ to Cloudflare Pages project '$PROJECT_NAME' (branch: $BRANCH)..."
npx wrangler pages deploy dist \
  --project-name="$PROJECT_NAME" \
  --branch="$BRANCH"

echo "==> Done."
