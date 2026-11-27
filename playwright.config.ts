import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta da interface. Pré-requisitos: API local com o seed aplicado e a Web rodando
 * (npm run dev). Execução: npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Os testes compartilham o mesmo banco (seed) e renderizam mapas WebGL: execução em série
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'pt-BR',
    viewport: { width: 1366, height: 860 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } }],
});
