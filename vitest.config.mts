import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: process.env.DB_TESTS ? ['tests/db/**/*.test.ts'] : ['tests/unit/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
