import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Single origin in development: the browser only talks to localhost:5173.
      // X-Forwarded-Proto lets express-session issue the Secure cookie on http://localhost.
      '/api': {
        target: 'http://localhost:3000',
        headers: { 'X-Forwarded-Proto': 'https' },
      },
    },
  },
  build: {
    sourcemap: false,
    outDir: 'dist',
  },
});
