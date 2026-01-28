const config = {
  apiUrl: 'http://localhost:5555',
  socketUrl: 'http://localhost:5000'
};

// Override with environment variables if available
if (typeof process !== 'undefined' && process.env) {
  if (process.env.VITE_API_URL) {
    config.apiUrl = process.env.VITE_API_URL;
    config.socketUrl = process.env.VITE_API_URL;
  }
}

export default config;
