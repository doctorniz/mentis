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
  webpack: (config) => {
    config.resolve.alias.canvas = false
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
