import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: mode === 'demo' ? [react(), viteSingleFile()] : [react()],
  base: mode === 'pages' ? '/farmacia/' : '/',
  build: mode === 'demo' ? { outDir: 'dist-demo' } : undefined,
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { host: true },
}));
