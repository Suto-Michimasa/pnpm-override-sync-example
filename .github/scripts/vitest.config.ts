import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['.github/scripts/**/*.test.ts'],
  },
})
