import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'apps/web/src') + '/',
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/server/test/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    pool: 'forks',
    testTimeout: 20_000,
  },
});
