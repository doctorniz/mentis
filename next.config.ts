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
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false
    // lamejs is a UMD library that references `document` at module scope.
    // Exclude it (and @huggingface/transformers) from the server bundle
    // so static-export prerendering doesn't crash. Both are only used
    // at runtime via dynamic import in client components.
    // Libraries that reference `document` at module scope crash
    // static-export prerendering. Stub them out on the server —
    // they're only used at runtime via dynamic import in client components.
    if (isServer) {
      config.resolve.alias['plyr'] = false
      config.resolve.alias['lamejs'] = false
      config.resolve.alias['@huggingface/transformers'] = false
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
