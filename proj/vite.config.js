import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server:  { port: 5173, host: true },
  build:   { outDir: 'dist', sourcemap: true },
  esbuild: { loader: 'jsx', include: /\.[jt]sx?$/ },
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
});
