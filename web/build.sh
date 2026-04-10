#!/usr/bin/env bash
# Build the Expo web export and stage Cloudflare Pages config files.
# Output: dist/ at the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Cleaning previous build..."
rm -rf dist

echo "==> Running expo export -p web..."
npx expo export -p web

echo "==> Relocating dist/assets/node_modules → dist/assets/_modules..."
# Cloudflare Pages silently drops any directory literally named "node_modules"
# during upload (a guardrail against publishing dependencies). Metro emits
# @expo/vector-icons fonts under dist/assets/node_modules/@expo/..., which
# means the .ttf files never reach the edge — the browser then receives the
# SPA fallback HTML for each font request and fails with
# `OTS parsing error: invalid sfntVersion`. Renaming the directory and
# rewriting references in the JS bundle is the simplest fix that doesn't
# require source-level changes or honoring `.assetsignore` (which the older
# Pages uploader ignores for hardcoded exclusions).
if [ -d dist/assets/node_modules ]; then
  mv dist/assets/node_modules dist/assets/_modules
  REWRITE_COUNT=0
  while IFS= read -r -d '' f; do
    if grep -q "/assets/node_modules/" "$f"; then
      sed -i 's|/assets/node_modules/|/assets/_modules/|g' "$f"
      REWRITE_COUNT=$((REWRITE_COUNT + 1))
    fi
  done < <(find dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.json" -o -name "*.css" \) -print0)
  echo "    rewrote references in $REWRITE_COUNT bundle file(s)"
fi

echo "==> Staging Cloudflare Pages config files into dist/..."
if [ -f web/public/_headers ]; then
  cp web/public/_headers dist/_headers
fi
if [ -f web/public/_redirects ]; then
  cp web/public/_redirects dist/_redirects
fi

echo "==> Verifying critical assets are present..."
FONT_COUNT=$(find dist/assets -name "*.ttf" 2>/dev/null | wc -l)
if [ "$FONT_COUNT" -eq 0 ]; then
  echo "ERROR: no .ttf font files found under dist/assets — build likely broken." >&2
  exit 1
fi
echo "    found $FONT_COUNT font files"

echo "==> Build complete. Output: $REPO_ROOT/dist"
