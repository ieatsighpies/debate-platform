const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  gameMode: {
    type: String,
    enum: ['human-human', 'human-ai'],
    required: true
  },
  debateTopic: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'active', 'closed'],
    default: 'open',
    index: true
  },
  currentParticipantCount: {
    type: Number,
    default: 0
  },
  maxParticipants: {
    type: Number,
    required: true
  },
  adminUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  participantUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  closedAt: {
    type: Date
  }
});

// Compound index for efficient session matching queries
sessionSchema.index({ gameMode: 1, debateTopic: 1, status: 1, currentParticipantCount: 1 });

// Prevent invalid state transitions
sessionSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const invalidTransitions = {
      'closed': ['open', 'active'],
      'active': ['open']
    };

    if (this._original && invalidTransitions[this._original.status]?.includes(this.status)) {
      return next(new Error(`Invalid status transition from ${this._original.status} to ${this.status}`));
    }
  }
  next();
});

// Store original status for validation
sessionSchema.post('init', function() {
  this._original = this.toObject();
});

module.exports = mongoose.model('Session', sessionSchema);
