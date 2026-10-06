import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.FRONTEND_PORT ?? 5173),
    strictPort: true,
    proxy: { ...(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ? { '/otel/v1/traces': { target: new URL(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).origin, rewrite: () => '/v1/traces' } } : {}), '/login': `http://127.0.0.1:${process.env.BACKEND_PORT ?? 3001}`,
      '/api/orders': { target: `http://127.0.0.1:${process.env.BACKEND_PORT ?? 3001}`, rewrite: path => path.replace(/^\/api/, '') } },
  },
});
