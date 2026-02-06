const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'participant'],
    default: 'participant'
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
});

// Virtual field for password
userSchema.virtual('password')
  .set(function(plainPassword) {
    this._plainPassword = plainPassword;
    this._passwordModified = true; // Mark that password was set
  })
  .get(function() {
    return this._plainPassword;
  });

// Hash password before validation (changed from 'save' to 'validate')
userSchema.pre('validate', async function(next) {
  // Only process if password was set via virtual
  if (!this._passwordModified || !this._plainPassword) {
    return next();
  }

  try {
    console.log('[User Model] Hashing password for:', this.username);
    const salt = await bcrypt.genSalt(10);

    // Hash the plain password and store in passwordHash
    this.passwordHash = await bcrypt.hash(this._plainPassword, salt);

    // Clear temporary variables
    this._plainPassword = undefined;
    this._passwordModified = false;

    console.log('[User Model] Password hashed successfully');
    next();
  } catch (error) {
    console.error('[User Model] Hashing error:', error);
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    const user = await mongoose.model('User').findById(this._id).select('+passwordHash');
    if (!user || !user.passwordHash) {
      return false;
    }
    return await bcrypt.compare(candidatePassword, user.passwordHash);
  } catch (error) {
    console.error('[User Model] Error comparing password:', error);
    return false;
  }
};

module.exports = mongoose.model('User', userSchema);
