import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite plugin: serve 'three' as a virtual module that re-exports from CDN URL
// Vite passes http(s) URL imports through to the browser, which resolves them via importmap
const threeCdnPlugin = () => ({
  name: 'three-cdn',
  resolveId(source: string) {
    if (source === 'three') {
      return '\0three-cdn';
    }
    return null;
  },
  load(id: string) {
    if (id === '\0three-cdn') {
      return `export * from 'https://registry.npmmirror.com/three/0.160.0/files/build/three.module.js';`;
    }
    return null;
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), threeCdnPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@data': path.resolve(__dirname, './src/data'),
      '@types': path.resolve(__dirname, './src/types'),
      '@store': path.resolve(__dirname, './src/store'),
      '@components': path.resolve(__dirname, './src/components'),
      '@modules': path.resolve(__dirname, './src/modules'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false,
  },
  optimizeDeps: {
    exclude: ['three', 'peerjs'],
  },
  build: {
    rollupOptions: {
      external: ['three', 'peerjs'],
    },
  },
});
