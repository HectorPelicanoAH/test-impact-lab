import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.FRONTEND_PORT ?? 5173),
    strictPort: true,
    proxy: { '/login': `http://127.0.0.1:${process.env.BACKEND_PORT ?? 3001}` },
  },
});
