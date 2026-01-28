const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/debate-platform');
    console.log('Connected to MongoDB');

    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const admin = new User({
        username: 'admin',
        passwordHash,
        role: 'admin'
      });
      await admin.save();
      console.log('Admin user created: username=admin, password=admin123');
    } else {
      console.log('Admin user already exists');
    }

    mongoose.disconnect();
    console.log('Seeding complete');

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();