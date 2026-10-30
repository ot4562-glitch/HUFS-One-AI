import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/contracts/**/*.test.ts', 'tests/consumers/**/*.test.ts', 'tests/api/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    testTimeout: 15000,
  },
});
