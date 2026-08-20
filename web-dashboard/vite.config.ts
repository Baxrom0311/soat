import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dashboard SPA is served by FastAPI under three separate routes (/login, /app,
// /admin) depending on auth state/role — assets are mounted at their own fixed
// path so they don't depend on which route the page was loaded from.
export default defineConfig({
  base: '/dashboard-static/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8010',
        ws: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8010',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
