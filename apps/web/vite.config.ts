import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// En desarrollo, /api va al servidor local: misma dirección que la app, como en producción.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { host: true, proxy: { '/api': 'http://localhost:3000' } },
});
