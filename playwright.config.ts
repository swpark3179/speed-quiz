import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = 4173;
const dataDir = path.join(os.tmpdir(), `sq-e2e-${process.pid}`);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning dist/server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PUBLIC_BASE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_INITIAL_USERNAME: 'admin',
      ADMIN_INITIAL_PASSWORD: 'e2e-password',
      LOG_LEVEL: 'warn',
    },
  },
});
