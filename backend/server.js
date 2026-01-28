const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';

const envPath = path.join(__dirname, '..', envFile);

console.log(`[Env] Loading ${envFile} from ${envPath}...`);

// ✅ FIXED: Load .env in ALL environments (platform vars override)
require('dotenv').config({
  path: envPath
});

// ✅ Log loaded vars (debug)
console.log('[Env] MONGODB_URI:', process.env.MONGODB_URI ? 'Set ✓' : 'Missing ❌');

// Validate environment variables
const validateEnv = require('./utils/validateEnv');
validateEnv();


const authRoutes = require('./routes/auth');
const debateRoutes = require('./routes/debates');

const app = express();
const server = http.createServer(app);

// ============================================
// CORS Configuration
// ============================================
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

// ============================================
// Socket.IO Configuration
// ============================================
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Allow both transports
  allowEIO3: true // Support older clients
});

// Make io accessible in routes
app.set('io', io);

// ============================================
// Middleware
// ============================================
app.use(express.json());

// ============================================
// Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/debates', debateRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ============================================
// Socket.IO Connection Handling
// ============================================
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);

  // Join debate room
  socket.on('join:debate', (debateId) => {
    console.log('[Socket] Client joined debate room:', debateId);
    socket.join(`debate:${debateId}`);
  });

  // Leave debate room
  socket.on('leave:debate', (debateId) => {
    console.log('[Socket] Client left debate room:', debateId);
    socket.leave(`debate:${debateId}`);
  });

  // Disconnect
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Client disconnected:', socket.id, 'Reason:', reason);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('[Socket] Socket error:', error);
  });
});

// ============================================
// MongoDB Connection
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/debate-platform-v2';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('[MongoDB] ✅ Connected to MongoDB');
    console.log('[MongoDB] Database:', mongoose.connection.name);
  })
  .catch((error) => {
    console.error('[MongoDB] ❌ Connection error:', error);
    process.exit(1);
  });

// ============================================
// Start Server
// ============================================
const PORT = process.env.PORT || 5555;

server.listen(PORT, () => {
  console.log('\n=================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO ready`);
  console.log(`🌐 Client URL: ${CLIENT_URL}`);
  console.log('=================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
  console.log('[Server] Server closed');
  const { cleanupAllAITimeouts } = require('./routes/debates');
  cleanupAllAITimeouts();
  mongoose.connection.close(false, () => {
    console.log('[MongoDB] Connection closed');
    process.exit(0);
  });
  });
});
