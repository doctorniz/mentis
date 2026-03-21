import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Cross-Origin-Opener-Policy',
          value: 'same-origin',
        },
        {
          key: 'Cross-Origin-Embedder-Policy',
          value: 'require-corp',
        },
      ],
    },
  ],
}

export default nextConfig
