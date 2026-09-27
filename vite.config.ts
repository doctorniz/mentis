import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const stub = path.resolve(__dirname, 'src/lib/empty-module.js')

/**
 * Next/webpack split this app across ~14 initial chunks. A single monolithic
 * bundle is itself a deviation from that, and it also leaves the service worker
 * unable to cache the shell promptly (one 4.3 MB asset), which breaks offline
 * reload. Grouping the large eager vendors restores a comparable layout.
 *
 * This only regroups modules that were already in the eager graph — lazy
 * boundaries (`await import(...)`) are unaffected.
 */
const EAGER_VENDOR_GROUPS: Array<[string, string[]]> = [
  ['vendor-react', ['/react/', '/react-dom/', '/scheduler/']],
  ['vendor-editor', ['/@tiptap/', '/prosemirror-']],
  ['vendor-pdflib', ['/pdf-lib/', '/@pdf-lib/']],
  ['vendor-fabric', ['/fabric/']],
  ['vendor-codemirror', ['/@codemirror/', '/@lezer/']],
  // Only `xlsx` — `jspreadsheet-ce` is reached solely through `await import()`,
  // and naming it here would pull the lazy grid into the eager chunk.
  ['vendor-sheets', ['/xlsx/']],
  ['vendor-flow', ['/@xyflow/']],
  ['vendor-text', ['/minisearch/', '/turndown/', '/marked/', '/gray-matter/']],
]

export default defineConfig(({ mode }) => {
  // Keep the existing `NEXT_PUBLIC_` variable names so `.env.local` and any
  // deployment environment carry over untouched. `define` below feeds them to
  // source as `process.env.*`, so no call site needs to change.
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_'])

  return {
    plugins: [react()],

    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        // pdfjs / fabric declare an optional dependency on the Node `canvas`
        // package. Same stub next.config.ts uses.
        { find: 'canvas', replacement: stub },
        // pptxgenjs (via slidecanvas) has `import('node:fs')` / `import('node:https')`
        // in Node-only code paths. Rollup resolves dynamic import targets at build
        // time and errors on the unknown `node:` scheme, so map them to the same
        // empty stub webpack's NormalModuleReplacementPlugin uses today. The code
        // behind them is never reached in a browser.
        { find: /^node:(fs|https)$/, replacement: stub },
      ],
    },

    define: {
      'process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID': JSON.stringify(
        env.NEXT_PUBLIC_DROPBOX_CLIENT_ID ?? '',
      ),
    },

    optimizeDeps: {
      // Let these load as-is rather than going through esbuild pre-bundling,
      // which resolves `node:` specifiers before `resolve.alias` can rewrite them.
      exclude: ['slidecanvas', 'pptxgenjs'],
    },

    build: {
      // Keep Next's output directory so `pnpm start`, the Playwright CI command
      // and the deployment docs all keep working unchanged.
      outDir: 'out',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          authDropbox: path.resolve(__dirname, 'auth/dropbox.html'),
        },
        output: {
          manualChunks(id) {
            // Rollup normalises ids to forward slashes on every platform.
            const p = id
            if (!p.includes('/node_modules/')) return
            for (const [name, needles] of EAGER_VENDOR_GROUPS) {
              if (needles.some((n) => p.includes('/node_modules' + n))) return name
            }
          },
        },
        onwarn(warning, warn) {
          // ~110 files carry a `'use client'` directive that is meaningless
          // outside Next. Harmless here, but Rollup warns once per file.
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
          warn(warning)
        },
      },
    },

    // Playwright's baseURL and the CI `serve out -l 3000` command both assume 3000.
    server: { port: 3000, strictPort: true },
    preview: { port: 3000, strictPort: true },
  }
})
