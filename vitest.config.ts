import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { VITE_PUBLIC_SITE_URL: '' },
  },
});
