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
assets; other assets are stale-while-revalidate. The inline script in
`index.html` registers it and warms the cache.

## Cross-origin isolation (optional)

Nothing in Mentis requires `SharedArrayBuffer` today, so COOP/COEP headers are
not set. If a future feature needs cross-origin isolation, send on every route:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

and check third-party embeds (link previews, images) still load, since
`require-corp` blocks cross-origin assets without CORP/CORS headers.
