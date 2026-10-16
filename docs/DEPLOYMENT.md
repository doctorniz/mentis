# Deploying the web app

The web build is a static site in `out/` (`pnpm build`); there is no server.
The desktop and Android apps embed the same front end and are built by Tauri —
see the README and [`ANDROID.md`](./ANDROID.md).

## What the host must do

- **Serve `out/`.** Any static host works. `pnpm start` serves it locally
  (`serve out -L`).
- **Serve `/auth/dropbox`** from `out/auth/dropbox.html` — the Dropbox sign-in
  returns to that extensionless path ([`CLOUD_SYNC.md`](./CLOUD_SYNC.md)).
  `serve -L` does this; on Vercel, `cleanUrls` in `vercel.json` does; with
  nginx, spell it out with `try_files`.

`vercel.json` sets the Vite preset, `pnpm install --frozen-lockfile`,
`pnpm build`, the `out/` directory and `cleanUrls`.

## Offline and updates

`public/sw.js` is a hand-written service worker. Navigations are
**network-first**, falling back to the cache offline, so a new deploy is picked
up on the next load instead of serving a stale `index.html` against new
assets; other assets are stale-while-revalidate. `public/boot.js`,
loaded by every page, registers it and warms the cache.

## Content security policy

The website sends a `Content-Security-Policy` header (`vercel.json`); the
desktop and phone apps carry the same policy in `src-tauri/tauri.conf.json`,
minus `frame-ancestors`, which only works as a header. `tests/csp.test.ts`
keeps the two, and the e2e server's `tests/e2e/serve.json`, identical.

- Script runs only from the app itself (plus `cdn.jsdelivr.net`, where the
  on-device model and transcription load their WebAssembly runtimes): no
  inline script, no `eval`. `'wasm-unsafe-eval'` is for SQLite, PDF and those
  runtimes. The canvas loads `pixi.js/unsafe-eval`, which despite its name
  is Pixi's renderer without `eval`.
- Network requests may go to any `http:` or `https:` address: AI providers
  take a custom base URL and Ollama runs anywhere on the LAN.
- Images may come from any `https:` address (bookmark previews, remote images
  in notes). Inline styles are allowed; the editors set them.
- The apps keep inline styles working by not letting Tauri hash them
  (`dangerousDisableAssetCspModification: ["style-src"]`); hashes would switch
  `'unsafe-inline'` off. In development (`devCsp: null`) there is no policy.

In CI the e2e suite runs against the policy, and any violation fails the test
that caused it (`tests/e2e/fixtures.ts`).

## Cross-origin isolation (optional)

Nothing in Mentis requires `SharedArrayBuffer` today, so COOP/COEP headers are
not set. If a future feature needs cross-origin isolation, send on every route:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

and check third-party embeds (link previews, images) still load, since
`require-corp` blocks cross-origin assets without CORP/CORS headers.
