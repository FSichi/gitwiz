import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    env: {
      // Tests assert on English messages regardless of the host machine locale.
      GITWIZ_LANG: 'en',
    },
  },
});
