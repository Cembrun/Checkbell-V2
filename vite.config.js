import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Clean Vite config for the frontend. Backend-specific server code
// must live in backend/server.js (not here).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
