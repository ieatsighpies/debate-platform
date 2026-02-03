const mongoose = require('mongoose');

const debateSchema = new mongoose.Schema({
  topicId: {
    type: Number,
    required: true
  },
  topicQuestion: {
    type: String,
    required: true
  },
  gameMode: {
    type: String,
    enum: ['human-human', 'human-ai'],
    required: true
  },

  // Player 1 (Always Human)
  player1UserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  player1Stance: {
    type: String,
    enum: ['for', 'against'],
    required: true
  },

  // Player 2 (Human or AI)
  player2Type: {
    type: String,
    enum: ['human', 'ai'],
    default: null
  },
  player2UserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  player2AIModel: {
    type: String,
    default: null // 'easy-bot', 'medium-bot', 'hard-bot', 'gpt-4'
  },
  player2AIPrompt: {
    type: String,
    default: null // Custom system prompt for this specific AI opponent
  },
  player2Stance: {
    type: String,
    enum: ['for', 'against'],
    default: null
  },

  // Status
  status: {
    type: String,
    enum: ['waiting', 'active', 'completed', 'abandoned'],
    default: 'waiting',
    index: true
  },

  // Debate flow
  currentRound: {
    type: Number,
    default: 1
  },
  maxRounds: {
    type: Number,
    default: 10
  },
  firstPlayer: {
    type: String,
    enum: ['for', 'against'],
    default: null
  },

  // AI Control
  aiEnabled: {
    type: Boolean,
    default: true // Can admin pause AI?
  },
  aiResponseDelay: {
    type: Number,
    default: 10, // Seconds to wait before AI responds
    min: 7,
    max: 30
  },
  aiLastResponseAt: {
    type: Date,
    default: null
  },

  // Arguments
  arguments: [{
    stance: {
      type: String,
      enum: ['for', 'against'],
      required: true
    },
    text: {
      type: String,
      required: true,
      maxlength: 500
    },
    round: {
      type: Number,
      required: true
    },
    submittedBy: {
      type: String,
      enum: ['human', 'ai'],
      default: 'human'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // PRE-DEBATE SURVEY
  preDebateSurvey: {
    player1: {
      type: String,
      enum: [
        'firm_on_stance',           // "I am firm on my stance."
        'convinced_of_stance',      // "I am convinced of my stance."
        'open_to_change'            // "I am open to changing my mind about this."
      ],
      default: null
    },
    player2: {
      type: String,
      enum: [
        'firm_on_stance',
        'convinced_of_stance',
        'open_to_change'
      ],
      default: null
    }
  },

  // POST-DEBATE SURVEY
  postDebateSurvey: {
    player1: {
      type: String,
      enum: [
        'still_firm',                // "I am still firm on my stance."
        'opponent_made_points',      // "My opponent made good points, but my stance remains the same."
        'convinced_to_change'        // "My opponent convinced me to change my stance."
      ],
      default: null
    },
    player2: {
      type: String,
      enum: [
        'still_firm',
        'opponent_made_points',
        'convinced_to_change'
      ],
      default: null
    },
    player1OpponentPerception: {
      type: String,
      enum: ['human', 'ai', 'unsure'],
      default: null
    },
    player2OpponentPerception: {
      type: String,
      enum: ['human', 'ai', 'unsure'],
      default: null
    }
  },
  // ✅ NEW: Q3 - Confidence level
  player1PerceptionConfidence: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  player2PerceptionConfidence: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  // ✅ NEW: Q4 - When suspected
  player1SuspicionTiming: {
    type: String,
    enum: ['before_5', 'rounds_5_10', 'rounds_10_15', 'rounds_15_20', 'never_suspected'],
    default: null
  },
  player2SuspicionTiming: {
    type: String,
    enum: ['before_5', 'rounds_5_10', 'rounds_10_15', 'rounds_15_20', 'never_suspected'],
    default: null
  },
  // ✅ NEW: Q5 - Detection cues
  player1DetectionCues: {
    type: [String],
    default: []
  },
  player2DetectionCues: {
    type: [String],
    default: []
  },
  // ✅ NEW: Q5 - Other reason (if specified)
  player1DetectionOther: {
    type: String,
    default: null
  },
  player2DetectionOther: {
    type: String,
    default: null
  },

  // Closing statements
  player1ClosingStatement: String,
  player2ClosingStatement: String,

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  startedAt: Date,
  completedAt: Date,
  lastActivityAt: {
    type: Date,
    default: Date.now
  },

  // Admin notes
  matchedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // Admin who manually matched this debate
  },
  //end vote before 10 rounds
  earlyEndVotes: {
  player1Voted: { type: Boolean, default: false },
  player2Voted: { type: Boolean, default: false },
  humanVoted: { type: Boolean, default: false },
  player1Timestamp: Date,
  player2Timestamp: Date,
  expired: { type: Boolean, default: false }
},
completionReason: String

});

// Compound indexes
debateSchema.index({ gameMode: 1, topicId: 1, status: 1 });
debateSchema.index({ status: 1, createdAt: -1 });

// Automatically update lastActivityAt on save
debateSchema.pre('save', function(next) {
  this.lastActivityAt = new Date();
  next();
});

module.exports = mongoose.model('Debate', debateSchema);
