import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // El backend y el frontend se levantan por separado (ver README de fase 6).
  // webServer: [{ command: 'pnpm dev', port: 5173, reuseExistingServer: true }],
});
