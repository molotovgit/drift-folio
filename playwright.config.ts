import { defineConfig } from '@playwright/test'

const port = Number(process.env.PW_PORT ?? 4173)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // software-rendered WebGL is CPU-heavy; parallel browsers starve each other and crash
  workers: 1,
  // software GL occasionally loses the browser context after the heavy mountain tests;
  // a retry runs in a fresh worker/browser, so one infra hiccup doesn't fail the gate
  retries: 1,
  use: { baseURL: `http://localhost:${port}/` },
  webServer: { command: `npx vite preview --port ${port} --strictPort`, url: `http://localhost:${port}/`, reuseExistingServer: false, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } }],
})
