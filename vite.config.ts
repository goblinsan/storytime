import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/storytime/' : '/',
  plugins: [react()],
  test: {
    // These suites run against one real Postgres and each truncates it, so they
    // cannot run in parallel. Isolating by database per file would be the other
    // answer; this one is honest and costs a few seconds.
    fileParallelism: false,
    setupFiles: [
      // supertest binds the wildcard address and connects to 127.0.0.1; another
      // local daemon can hold that port on loopback and answer instead. See the
      // file: this was the intermittent failure.
      './server/__tests__/support/supertestLoopback.js',
      // Records every failing response with its body, but only when
      // STORYTIME_DIAGNOSE names a file to write to.
      './server/__tests__/support/diagnoseResponses.js',
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Reference art is served by the API from import/, not from public/, so
      // it has to be proxied too or every portrait is a broken image in dev.
      '/reference': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}))
