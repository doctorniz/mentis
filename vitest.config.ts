import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  define: { __MENTIS_DESKTOP__: false },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The app bundles mammoth's browser build; tests must read docx the same way.
      mammoth: path.resolve(__dirname, './node_modules/mammoth/mammoth.browser.js'),
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
