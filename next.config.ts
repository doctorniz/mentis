import type { NextConfig } from 'next'
import path from 'path'

const canvasStub = path.resolve(__dirname, 'src/lib/empty-module.js')

const nextConfig: NextConfig = {
  output: 'export',
  turbopack: {
    resolveAlias: {
      canvas: canvasStub,
    },
  },
  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias.canvas = false
    // Libraries that reference `document` or browser globals at module scope
    // crash static-export prerendering. Stub them out on the server —
    // they're only used at runtime via dynamic import in client components.
    if (isServer) {
      config.resolve.alias['plyr'] = false
      config.resolve.alias['@huggingface/transformers'] = false
      config.resolve.alias['mp3-mediarecorder'] = false
      config.resolve.alias['slidecanvas'] = false
    }
    // pptxgenjs (a slidecanvas dep) has `import 'node:fs'` / `import 'node:https'`
    // in its ESM bundle for server-side file I/O. Webpack throws
    // UnhandledSchemeError because the `node:` URI scheme is unknown in browser
    // builds — and resolve.alias runs too late (after the scheme check).
    // NormalModuleReplacementPlugin fires before the scheme resolver and rewrites
    // any `node:*` request to the empty-module stub, which is safe because none
    // of that Node I/O code is ever reached at browser runtime.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, canvasStub)
      )
    }
    return config
  },
  // COOP/COEP headers (needed for SharedArrayBuffer) must be set at the
  // hosting layer since `output: 'export'` produces a static site where
  // Next.js `headers()` has no effect. See docs/DEPLOYMENT.md or the
  // platform-specific examples below:
  //
  // Vercel        → vercel.json  { "headers": [{ "source": "/(.*)", "headers": [...] }] }
  // Netlify       → _headers     /*  Cross-Origin-Opener-Policy: same-origin
  //                                   Cross-Origin-Embedder-Policy: require-corp
  // Cloudflare    → _headers (same format as Netlify)
  // S3+CloudFront → Lambda@Edge or CloudFront Function to inject headers
  // nginx         → add_header Cross-Origin-Opener-Policy same-origin always;
  //                  add_header Cross-Origin-Embedder-Policy require-corp always;
}

export default nextConfig
