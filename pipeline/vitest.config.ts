import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: {} }, // stop vite from walking up to the dashboard app's postcss config
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
