import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Java nalog service. These must come BEFORE the generic /api rule.
      '/api/nalozi': 'http://localhost:8081',
      '/api/parts': 'http://localhost:8081',
      '/api': 'http://localhost:4000'
    }
  }
});
