import { defineConfig } from '@playwright/test'

const port = Number(process.env.PW_PORT ?? 4173)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}/` },
  webServer: { command: `npx vite preview --port ${port} --strictPort`, url: `http://localhost:${port}/`, reuseExistingServer: false, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } }],
})
