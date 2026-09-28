# Mentis — Static deployment & headers

The app is built with **Vite** — a fully static site under `out/`. There is **no** server runtime, so headers must be set by the host; nothing in the build can set them.

Two HTML entry points are emitted: `out/index.html` (the app) and `out/auth/dropbox.html` (the Dropbox OAuth return). The host must serve the extensionless path `/auth/dropbox` from that file — the registered OAuth redirect URI depends on it. `serve out -L` does this by default; on Vercel it comes from `cleanUrls` in the repo's `vercel.json` (which also sets the Vite preset and the `out/` output directory, overriding the project's old Next.js preset); a bare nginx `try_files` setup needs it spelled out.

## COOP / COEP (SharedArrayBuffer)

Some dependencies (for example PDF.js worker paths) benefit from **cross-origin isolation**. If you need `SharedArrayBuffer` or stricter worker behaviour, configure your host to send these on **HTML** (and typically all routes):

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

**Examples** (adjust to your host):

| Platform             | Where to configure                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Vercel**           | `vercel.json` — `headers` on `"/(.*)"`                                                                                         |
| **Netlify**          | `public/_headers` (copied to `out/_headers` on build)                                                                          |
| **Cloudflare Pages** | `_headers` same as Netlify                                                                                                     |
| **S3 + CloudFront**  | Lambda@Edge or CloudFront Function                                                                                             |
| **nginx**            | `add_header Cross-Origin-Opener-Policy same-origin always;` and `add_header Cross-Origin-Embedder-Policy require-corp always;` |

`COEP: require-corp` means cross-origin assets (images, scripts, iframes) must be served with CORS or `Cross-Origin-Resource-Policy` as appropriate — verify third-party embeds after enabling.

## OAuth redirects (cloud sync)

Dropbox sign-in returns to `/auth/dropbox`, which is its **own** HTML entry (`out/auth/dropbox.html`) rather than a client-side route inside `index.html`. The host must map the extensionless path to that file. Register the **full** redirect URI in the Dropbox app. Setup: [`CLOUD_SYNC.md`](./CLOUD_SYNC.md).

## Related

- Build output and bundling: [`TECH_STACK.md`](./TECH_STACK.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Cloud sync env and providers: [`CLOUD_SYNC.md`](./CLOUD_SYNC.md)
- PWA / offline shell: `public/sw.js`, plus the inline bootstrap in `index.html` (theme class, SW registration, cache warm-up)
