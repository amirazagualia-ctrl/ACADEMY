// ESLint 9 (flat config) — Rahma Academy
// Objectif Palier 1 : filet de sécurité, pas de refonte. Règles = erreurs réelles (bugs probables) en « error »,
// dette connue (any, variables inutilisées) en « warn » pour être réduite progressivement au Palier 2.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'logs/**', 'core', 'docs/**/.vitepress/cache/**', 'src/install-sql.ts', 'src/curriculum-seed.ts', 'public/static/situations-data-*.js', 'public/static/pdf-fonts.js'] },
  js.configs.recommended,
  // --- Serveur : TypeScript (Hono / Cloudflare Workers) ---
  ...tseslint.configs.recommended.map(c => ({ ...c, files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts', 'scripts/**/*.mjs', '*.mjs', '*.ts'] })),
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.es2022, KVNamespace: 'readonly', D1Database: 'readonly', R2Bucket: 'readonly', ExecutionContext: 'readonly' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',           // 418 occurrences : dette suivie, réduite au Palier 2
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-useless-escape': 'warn'
    }
  },
  // --- Front : scripts globaux chargés par <script> (pas de modules) ---
  {
    files: ['public/static/**/*.js', 'public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser, ...globals.es2022,
        axios: 'readonly', dayjs: 'readonly', Chart: 'readonly', jspdf: 'readonly', XLSX: 'readonly', QRCode: 'readonly', confetti: 'readonly',
        // objets partagés entre fichiers (définis dans app.js / public.js) — déclarés writable car assignés par plusieurs scripts
        App: 'writable', VIEWS: 'writable', ROUTES: 'writable', BRAND: 'writable', TENANT: 'writable', UI: 'writable', MODULES: 'writable',
        LEVELS: 'writable', LEVEL_LABELS: 'writable', CYCLE_LABELS: 'writable', ALL_LEVELS: 'writable', FIRST_CYCLE: 'writable'
      }
    },
    rules: {
      'no-undef': 'off',            // fonctions partagées entre fichiers globaux (render, navigate, esc…) : vérifié au Palier 4 (modules ES)
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-redeclare': 'off',        // const partagés redéclarés volontairement dans certains fichiers
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-inner-declarations': 'off',
      'no-case-declarations': 'warn'
    }
  },
  {
    files: ['scripts/**/*.mjs', '*.mjs', 'tests/**/*.mjs', 'vitest.config.ts', 'vite.config.ts', 'ecosystem.config.cjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] }
  },
  {
    files: ['scripts/**/*.mjs', '*.mjs', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' }] }
  },
  { files: ['ecosystem.config.cjs'], languageOptions: { sourceType: 'commonjs' } },
  { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  prettier
)
