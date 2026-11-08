import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // one backend: the Java service
      '/api': 'http://localhost:8081'
    }
  }
});
