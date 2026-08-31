import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite plugin: serve CDN modules as virtual modules that re-export from CDN URL
// Vite passes http(s) URL imports through to the browser, which resolves them via importmap
const cdnPlugin = () => ({
  name: 'cdn-modules',
  resolveId(source: string) {
    if (source === 'three') return '\0three-cdn';
    if (source === 'peerjs') return '\0peerjs-cdn';
    return null;
  },
  load(id: string) {
    if (id === '\0three-cdn') {
      return `export * from 'https://registry.npmmirror.com/three/0.160.0/files/build/three.module.js';`;
    }
    if (id === '\0peerjs-cdn') {
      // Use esm.sh which auto-wraps npm packages as proper ESM modules
      // Fallback chain: esm.sh -> jsdelivr +esm
      return `
import Peer from 'https://esm.sh/peerjs@1.5.4';
export default Peer;
export { Peer };
`;
    }
    return null;
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), cdnPlugin()],
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
