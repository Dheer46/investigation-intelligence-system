import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS (via a self-signed cert, basicSsl) is required for the /gate page's
// camera capture - browsers only allow getUserMedia() on secure contexts,
// and a LAN IP like https://10.44.9.168:5173 doesn't qualify without it
// (localhost is exempt, which is why this wasn't needed for local-only
// testing). Visitors see a one-time self-signed-certificate warning to
// click through; that's expected, same as the admin portal.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    https: true,
    watch: {
      // Docker Desktop's Windows bind mounts don't reliably forward native fs
      // events into the container, so fall back to polling for dev reloads.
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://backend:3000',
        changeOrigin: true,
      },
    },
  },
});
