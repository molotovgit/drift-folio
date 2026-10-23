import { defineConfig } from 'vite'

// Relative base works both at molotovgit.github.io/drift-folio/ and at amirbek.is-a.dev/
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  // physics sims and the terrain build are CPU-heavy; the 5 s default flakes on loaded machines
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
})
