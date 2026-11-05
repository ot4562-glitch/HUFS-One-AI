import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Local development only: bound to 127.0.0.1 (no LAN exposure). /api is proxied to the
// local synthetic API (`npm run start:api:local`, API_INTERNAL_PORT default 3000).
export default defineConfig(({mode}) => {
  const pagesPreview = mode === 'pages-preview';
  if (pagesPreview && process.env.VITE_STATIC_PAGES_PREVIEW !== 'true') {
    throw new Error('Pages preview requires explicit synthetic-only build opt-in');
  }
  // configure-pages supplies the real path: private Pages can use a unique root
  // subdomain instead of the public /HUFS-One-AI/ project URL.
  const basePath = (process.env.PAGES_BASE_PATH ?? '').replace(/\/+$/, '');
  return {
  base: pagesPreview ? `${basePath}/` : '/',
  root: import.meta.dirname,
  plugins: [react(), ...(pagesPreview ? [{
    name: 'static-pages-preview-no-api',
    transformIndexHtml(html: string) {
      // Even an accidentally reachable API action cannot make network requests.
      return html.replace('</head>',
        '    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'none\'; img-src \'self\' data:; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">\n  </head>');
    },
  }] : [])],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {'/api': {target: 'http://127.0.0.1:3000', changeOrigin: false}},
  },
  preview: {host: '127.0.0.1', port: 4173, strictPort: true},
  build: {outDir: '../../dist/web', emptyOutDir: true, sourcemap: false},
  };
});
