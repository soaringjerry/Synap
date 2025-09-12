import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // listen on 0.0.0.0
    port: 5173,
    // Allow all hosts to access dev server (useful behind reverse proxies)
    // See: Vite server.allowedHosts option
    allowedHosts: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    proxy: {
      // Ensure calls like fetch('/api/...') from 5173 go to backend 8080
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
