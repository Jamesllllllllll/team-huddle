import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ['./tsconfig.json'],
    }),
    react(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    css: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      exclude: ['**/node_modules/**', 'dist/**', 'src/routeTree.gen.ts'],
    },
  },
})

