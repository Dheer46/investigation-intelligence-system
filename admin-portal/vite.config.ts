import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// A separate app on its own port - deliberately not a route inside the
// investigator dashboard. Officer provisioning (accounts, biometrics, USB
// pairing) is a distinct administrative function with its own login and
// its own visual identity, reachable from any PC on the network same as
// the dashboard, just at a different address.
//
// HTTPS (via a self-signed cert, basicSsl) is required here specifically
// because browsers only allow getUserMedia() camera access on "secure
// contexts" - localhost counts automatically, but a LAN IP like
// http://10.44.9.168:5174 does not. Visitors will see a one-time
// self-signed-certificate warning to click through; that's expected, not
// a misconfiguration.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5174,
    https: true,
    watch: {
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
