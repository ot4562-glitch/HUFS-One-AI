import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/contracts/**/*.test.ts', 'tests/consumers/**/*.test.ts', 'tests/api/**/*.test.ts',
      'tests/integration/**/*.test.ts', 'tests/e2e/**/*.test.ts',
      'tests/evaluation/**/*.test.ts',
      'packages/core/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/web/src/**/*.test.tsx'],
    environment: 'node',
    clearMocks: true,
    testTimeout: 15000,
  },
});
