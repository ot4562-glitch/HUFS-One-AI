import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Local development only: bound to 127.0.0.1 (no LAN exposure). /api is proxied to the
// local synthetic API (`npm run start:api:local`, API_INTERNAL_PORT default 3000).
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {'/api': {target: 'http://127.0.0.1:3000', changeOrigin: false}},
  },
  preview: {host: '127.0.0.1', port: 4173, strictPort: true},
  build: {outDir: '../../dist/web', emptyOutDir: true, sourcemap: false},
});
