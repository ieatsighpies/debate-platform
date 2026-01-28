import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default ({ mode }) => {
  // Load .env based on mode
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL
  console.log(`[Vite Config] Mode: ${mode}, API URL: ${apiUrl}`);

  return defineConfig({
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_NAME': JSON.stringify(process.env.VITE_APP_NAME)
    },
    server: {
      port: 3000,
      proxy: {
        '/api': apiUrl || 'http://localhost:5555',  // Use env or fallback
        '/socket.io': {
          target: apiUrl || 'http://localhost:5555',  // Use env or fallback
          ws: true
        }
      }
    },
    // ✅ Production build optimizations
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'development',  // ✅ Only dev
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom']  // Split vendors
          }
        }
      },
      chunkSizeWarningLimit: 1000  // ✅ Bigger chunks OK for prod
    },

    // ✅ Preview uses prod-like proxy (test before deploy)
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: apiUrl || 'http://localhost:5555',  // Use env or fallback
          changeOrigin: true
        }
      }
    }
  });
};
