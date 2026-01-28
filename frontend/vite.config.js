import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default ({ mode }) => {
  // Load .env based on mode
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  return defineConfig({
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_NAME': JSON.stringify(process.env.VITE_APP_NAME)
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5555' || "https://debate-platform-backend.onrender.com",  // Your backend port (check server.js or run npm start)
          changeOrigin: true
        }
      }
  },
  });
};
