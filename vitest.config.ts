import { defineConfig } from 'vitest/config'
// `tests/seed.test.mjs` est un SCRIPT autonome (lancé par `npm run test:seed`), pas un
// test Vitest : il appelle process.exit(0) et ferait échouer la suite. On l'exclut
// explicitement, tout en gardant les autres .test.mjs (cliquet F76).
export default defineConfig({ test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'], exclude: ['**/node_modules/**', 'tests/seed.test.mjs'], environment: 'node', globals: false, testTimeout: 15000 } })
