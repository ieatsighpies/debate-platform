const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    console.log('Attempting MongoDB connection...');
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', err => {
      console.error('MongoDB connection error:', err);
    });
  } catch (error) {
    console.error('MongoDB initial connection failed:', error.message);
    throw error;
  }
}

module.exports = connectDB;
