# Mentis — Static deployment & headers

The app is built with **Next.js `output: 'export'`** — a fully static site under `out/`. There is **no** server runtime, so Next.js `headers()` in `next.config.ts` has **no effect** on the built output.

## COOP / COEP (SharedArrayBuffer)

Some dependencies (for example PDF.js worker paths) benefit from **cross-origin isolation**. If you need `SharedArrayBuffer` or stricter worker behaviour, configure your host to send these on **HTML** (and typically all routes):

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

**Examples** (adjust to your host):

| Platform | Where to configure |
|----------|-------------------|
| **Vercel** | `vercel.json` — `headers` on `"/(.*)"` |
| **Netlify** | `public/_headers` (copied to `out/_headers` on build) |
| **Cloudflare Pages** | `_headers` same as Netlify |
| **S3 + CloudFront** | Lambda@Edge or CloudFront Function |
| **nginx** | `add_header Cross-Origin-Opener-Policy same-origin always;` and `add_header Cross-Origin-Embedder-Policy require-corp always;` |

`COEP: require-corp` means cross-origin assets (images, scripts, iframes) must be served with CORS or `Cross-Origin-Resource-Policy` as appropriate — verify third-party embeds after enabling.

## OAuth redirects (cloud sync)

Dropbox sign-in returns to `/auth/dropbox`. Your static host must serve the SPA for that URL (same as `/`: `index.html` or equivalent). Register the **full** redirect URI in the Dropbox app. Setup: [`CLOUD_SYNC.md`](./CLOUD_SYNC.md).

## Related

- Build output and bundling: [`TECH_STACK.md`](./TECH_STACK.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Cloud sync env and providers: [`CLOUD_SYNC.md`](./CLOUD_SYNC.md)
- PWA / offline shell: `public/sw.js`, root `layout.tsx`
