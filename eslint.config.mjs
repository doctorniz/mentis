import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import globals from 'globals'

/**
 * Replaces `next lint` (`next/core-web-vitals` + `next/typescript`), which went
 * away with Next.
 *
 * The aim is parity with what that config actually enforced, so the migration
 * doesn't quietly change what fails review:
 *
 *   - typescript-eslint's recommended set (this was `next/typescript`)
 *   - `react-hooks/rules-of-hooks` (error) + `react-hooks/exhaustive-deps` (warn),
 *     the only two rules eslint-config-next@15 switched on. The codebase has live
 *     `eslint-disable react-hooks/exhaustive-deps` directives that depend on them.
 *   - the react and jsx-a11y rules eslint-config-next enabled, at its severities
 *   - the repo's own `no-unused-vars` override
 *
 * Deliberately NOT enabled:
 *   - `@next/eslint-plugin-next`: its rules only describe Next APIs this app no
 *     longer uses.
 *   - `eslint-plugin-react-hooks`' v7 additions (`set-state-in-effect`, `refs`,
 *     `preserve-manual-memoization`, `immutability`, `incompatible-library`).
 *     eslint-config-next pinned v5, which had none of them; switching them on
 *     flags ~180 pre-existing patterns. Worth considering, but as its own
 *     deliberate decision rather than a side effect of changing bundler.
 *   - `js.configs.recommended`: eslint-config-next did not extend it, and it
 *     introduces base-rule failures (e.g. `no-fallthrough`) that were never errors.
 */
export default tseslint.config(
  {
    ignores: [
      'out/**',
      '.next/**',
      '.claude/**',
      'node_modules/**',
      'public/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
    ],
  },

  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/no-unknown-property': 'error',

      'jsx-a11y/alt-text': ['warn', { elements: ['img'] }],
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // `next lint` only covered the app source directories, so tests were never
    // linted. They are now, with two carve-outs rather than edits to test code:
    //   - Playwright's `use(...)` fixture callback trips rules-of-hooks, which
    //     reads any `use` call as React's `use` hook.
    //   - specs reach into untyped test hooks on `window` (e.g. `__mentisTest`).
    files: ['tests/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // CLAUDE.md principle 4: no feature reaches into another feature's
    // internals. A module may use core, shared lib and shared UI, and its own
    // files (relative imports) — never another module.
    files: ['src/modules/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*'],
              message: 'Modules may not import other modules. Go through @/core instead.',
            },
            {
              group: ['../*/**'],
              message: 'Modules may not import other modules. Go through @/core instead.',
            },
          ],
        },
      ],
    },
  },

  {
    // Core is the layer modules build on; it must not depend on them or on UI.
    // (Modules are discovered with import.meta.glob, not imported.)
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules/*', '@/components/*'],
              message: 'Core must not depend on modules or UI components.',
            },
          ],
        },
      ],
    },
  },
)
