import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default ({ mode }) => {
  // Load .env based on mode
  const env = loadEnv(mode, process.cwd(), '');

  return defineConfig({
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_NAME': JSON.stringify(process.env.VITE_APP_NAME)
    },
    server: {
      port: 3000,
      proxy: {
        '/api': 'http://localhost:5555',
        '/socket.io': {
          target: 'http://localhost:5555',
          ws: true
        }
      }
    },
    // ✅ Production build optimizations
    build: {
      outDir: 'dist',
      sourcemap: false,  // Disable for prod (smaller bundle)
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom']  // Split vendors
          }
        }
      }
    },

    // ✅ Preview uses prod-like proxy (test before deploy)
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5555',  // Use env or fallback
          changeOrigin: true
        }
      }
    }
  });
};
