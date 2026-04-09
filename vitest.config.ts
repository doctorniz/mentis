import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    // Default to 'node'. Tests needing a DOM use the per-file docblock
    // `@vitest-environment happy-dom`. Never use jsdom — it pulls native
    // `canvas` bindings that fail on Windows (Cairo) and most CI images.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
