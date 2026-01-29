const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:5555',
  socketUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:5555'
};

console.log('[Config] API URL:', config.apiUrl);
console.log('[Config] Socket URL:', config.socketUrl);
console.log('[Config] Mode:', import.meta.env.MODE);

export default config;
