import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite plugin: 将 three 等大体积库映射到 CDN URL，减少打包体积
// peerjs 由 src/utils/peerjsLoader.ts 统一管理（多 CDN 回退 + 智能重试）
const cdnPlugin = () => ({
  name: 'cdn-modules',
  resolveId(source: string) {
    if (source === 'three') return '\0three-cdn';
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
    exclude: ['three'],
  },
  build: {
    rollupOptions: {
      external: ['three'],
    },
  },
});
