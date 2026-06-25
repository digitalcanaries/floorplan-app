import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Flag genuine dead local variables, but allow:
      //  - SCREAMING_CASE / PascalCase placeholders (varsIgnorePattern)
      //  - unused function args (builder/callback signatures are positional)
      //  - unused catch bindings
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // React Compiler advisory rules — this project builds with plain Vite
      // (no compiler). The set-state-in-effect sites here are intentional
      // (boot-once project load, form-sync-on-id, auto-expand-on-select), so
      // this rule is off; keep preserve-manual-memoization visible as a warn.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // Backend + build config run under Node, not the browser.
    files: ['server/**/*.js', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
