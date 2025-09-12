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
  },
})
