import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev same-origin: la cookie HttpOnly de sesión viaja sin CORS.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  preview: { port: 5173 },
});
