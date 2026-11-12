import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');

  if (mode === 'production' && !env.VITE_API_URL) {
    throw new Error('Falta VITE_API_URL. Configura la URL pública de Railway en las variables de Vercel.');
  }

  return {
    appType: 'mpa',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(root, 'index.html'),
          admin: path.resolve(root, 'admin.html'),
          entrada: path.resolve(root, 'entrada.html'),
          miAcceso: path.resolve(root, 'mi-acceso.html'),
          pago: path.resolve(root, 'pago.html'),
        },
      },
    },
  };
});
