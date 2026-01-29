const config = {
  apiUrl: 'http://localhost:5555',
  socketUrl: 'http://localhost:5555'
};

// Override with environment variables if available
if (typeof process !== 'undefined' && process.env) {
  if (process.env.VITE_API_URL) {
    config.apiUrl = process.env.VITE_API_URL;
    console.log(`[Config] Overriding API URL with: ${config.apiUrl}`);
    config.socketUrl = process.env.VITE_SOCKET_URL;
    console.log(`[Config] Overriding Socket URL with: ${config.socketUrl}`);
  }
}

export default config;