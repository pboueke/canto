# Canto Web — Cloudflare Pages

This directory contains the build and deploy infrastructure for shipping the
Canto web app to **Cloudflare Pages** under the custom domain
`canto.boueke.com`.

The web target is a fully static, client-side SPA (no backend, no SSR). All
journal data lives in the user's browser (IndexedDB / localStorage) or in
their own Google Drive. There is nothing for a server to do.

## Files in this directory

| File                | Purpose                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`         | This guide.                                                                                                                                                                                                                                                                                                                    |
| `build.sh`          | Runs `expo export -p web`, stages `_headers`/`_redirects` into `dist/`.                                                                                                                                                                                                                                                        |
| `deploy.sh`         | Runs `build.sh`, then `wrangler pages deploy dist`.                                                                                                                                                                                                                                                                            |
| `public/_headers`   | Cloudflare Pages security & cache headers.                                                                                                                                                                                                                                                                                     |
| `public/_redirects` | SPA fallback so deep links resolve to `index.html`. The `/assets/*` and `/_expo/*` no-op rewrites **must come before** the `/*` catch-all, otherwise the SPA fallback intercepts hashed font/asset requests and the browser tries to parse `index.html` as a `.ttf` (manifesting as `OTS parsing error: invalid sfntVersion`). |

`build.sh` also performs a post-export rename of `dist/assets/node_modules → dist/assets/_modules` and rewrites references in the JS bundle. This is necessary because Cloudflare Pages' uploader silently excludes any directory literally named `node_modules`, which would otherwise drop all `@expo/vector-icons` font files from the deploy.

The build output (`dist/` at the repo root) is gitignored.

---

## Building locally

To produce the static bundle without deploying:

```bash
./web/build.sh
```

Output lands in `dist/` at the repo root. Inspect it with any static file
server, e.g.:

```bash
npx serve dist
```

Open `http://localhost:3000` and click through the main flows. **Watch out
for native-only modules** that may break or no-op on web:

- `expo-secure-store` — falls back to localStorage on web (unencrypted).
- `expo-local-authentication` — biometric unlock is unavailable.
- `@react-native-google-signin/google-signin` — native-only; web must use
  `expo-auth-session` with the web client ID from `google-credentials.ts`.
- `expo-file-system` — limited support; some import/export paths need the
  browser File API.

If anything crashes at module load time, the white-screen will surface
immediately during the local serve.

---

## Deploying to Cloudflare Pages

### First deployment

```bash
./web/deploy.sh
```

This will:

1. Run `web/build.sh` (clean export to `dist/`).
2. Upload `dist/` to the `canto` Pages project via wrangler.
3. Print a unique preview URL (e.g. `https://abc123.canto.pages.dev`) and
   the alias `https://canto.pages.dev` for the production branch.

Open the printed URL to verify the deploy.

### Subsequent deployments

Same command:

```bash
./web/deploy.sh
```

Each invocation creates a new Pages deployment. Wrangler keeps history in
the dashboard and lets you roll back to any prior deployment.

### Environment overrides

```bash
CF_PAGES_PROJECT=canto-staging ./web/deploy.sh   # deploy to a different project
CF_PAGES_BRANCH=preview ./web/deploy.sh          # deploy under a non-prod alias
```
