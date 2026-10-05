import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.DEMO_PORT ?? 5175),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.DEMO_API_PORT ?? 3002}` },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
