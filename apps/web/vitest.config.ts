import {defineConfig} from 'vitest/config';

// UI-track config so apps/web tests run without editing the root vitest/CI include lists.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    testTimeout: 15000,
  },
});
