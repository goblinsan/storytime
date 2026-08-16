import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // These suites run against one real Postgres and each truncates it, so they
    // cannot run in parallel. Isolating by database per file would be the other
    // answer; this one is honest and costs a few seconds.
    fileParallelism: false,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
