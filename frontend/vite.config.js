import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');

  // La URL de Railway se define en Vercel como VITE_API_URL.
  // No detenemos el build si falta: el sitio debe poder publicarse y mostrar
  // un aviso de conexión en pantalla mientras se termina de configurar la API.

  return {
    appType: 'mpa',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'https://frontend-frmi.vercel.app',
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
