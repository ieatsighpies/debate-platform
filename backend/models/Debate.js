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
  player1StanceChoice: {
    type: String,
    enum: ['for', 'against', 'unsure'],
    default: null
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
    default: null
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
  player2StanceChoice: {
    type: String,
    enum: ['for', 'against', 'unsure'],
    default: null
  },

  // Current belief stance (can shift independently of gameplay stance)
  currentBelief: {
    player1: {
      type: String,
      enum: ['for', 'against', 'unsure'],
      default: null
    },
    player2: {
      type: String,
      enum: ['for', 'against', 'unsure'],
      default: null
    }
  },
  // Numeric belief values (0-100) to capture fine-grained shifts
  currentBeliefValue: {
    player1: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    player2: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    }
  },

  // Status
  status: {
    type: String,
    enum: ['waiting', 'active', 'survey_pending', 'completed', 'abandoned'],
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
  firstPlayerPreference: {
    type: String,
    enum: ['for', 'against', 'random'],
    default: 'random' // Admin can override to force who starts first
  },
  nextTurn: {
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
    // Q1: Stance change effect
    player1: {
      type: String,
      enum: [
        'strengthened',
        'slightly_strengthened',
        'no_effect',
        'slightly_weakened',
        'weakened'
      ],
      default: null
    },
    player2: {
      type: String,
      enum: [
        'strengthened',
        'slightly_strengthened',
        'no_effect',
        'slightly_weakened',
        'weakened'
      ],
      default: null
    },
        // AI awareness effect (if opponent perceived as AI)
        player1AiAwarenessEffect: {
          type: String,
          enum: ['no_difference', 'less_persuasive', 'more_persuasive', 'not_sure'],
          default: null
        },
        player2AiAwarenessEffect: {
          type: String,
          enum: ['no_difference', 'less_persuasive', 'more_persuasive', 'not_sure'],
          default: null
        },
        player1AiAwarenessJustification: {
          type: String,
          maxlength: 1000,
          default: null
        },
        player2AiAwarenessJustification: {
          type: String,
          maxlength: 1000,
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
    },
    //  NEW: Stance strength & confidence (post)
    player1StanceStrength: {
      type: Number,
      min: 1,
      max: 7,
      default: null
    },
    player2StanceStrength: {
      type: Number,
      min: 1,
      max: 7,
      default: null
    },
    player1StanceConfidence: {
      type: Number,
      min: 1,
      max: 7,
      default: null
    },
    player2StanceConfidence: {
      type: Number,
      min: 1,
      max: 7,
      default: null
    },
    //  NEW: Q3 - Confidence level
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
    //  NEW: Q4 - When suspected
    player1SuspicionTiming: {
      type: String,
      enum: ['round_1_2','round_3_4','round_5_7','round_8_12','round_13_17','round_18_20','never_suspected'],
      default: null
    },
    player2SuspicionTiming: {
      type: String,
      enum: ['round_1_2','round_3_4','round_5_7','round_8_12','round_13_17','round_18_20','never_suspected'],
      default: null
    },
    //  NEW: Q5 - Detection cues
    player1DetectionCues: {
      type: [String],
      default: []
    },
    player2DetectionCues: {
      type: [String],
      default: []
    },
    //  NEW: Q5 - Other reason (if specified)
    player1DetectionOther: {
      type: String,
      default: null
    },
    player2DetectionOther: {
      type: String,
      default: null
    },
  },

  // Belief updates after rounds
  beliefHistory: [{
    round: {
      type: Number,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    player: {
      type: String,
      enum: ['player1', 'player2'],
      required: true
    },
    // Original categorical belief (kept for compatibility)
    belief: {
      type: String,
      enum: ['for', 'against', 'unsure'],
      default: null
    },
    // Numeric belief value (0-100) for fine-grained measurement
    beliefValue: {
      type: Number,
      min: 0,
      max: 100,
      required: false
    },
    // Self-reported influence (0-100)
    influence: {
      type: Number,
      min: 0,
      max: 100,
      required: true
    },
    // Optional confidence rating (0-100)
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    skipped: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Reflection / paraphrase entries after rounds (optional)
  reflections: [{
    round: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paraphrase: { type: String, maxlength: 1000 },
    acknowledgement: { type: String, maxlength: 500 },
    timestamp: { type: Date, default: Date.now }
  }],

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

  // Validate turn state to prevent logic loss
  const turnValidator = require('../utils/turnValidator');
  const validation = turnValidator.validateTurnState(this);

  if (!validation.isValid) {
    console.warn('[Debate] Turn state validation failed:', {
      debateId: this._id,
      status: this.status,
      errors: validation.errors
    });

    // Auto-fix the turn state
    const fixed = turnValidator.autoFixTurnState(this);
    if (fixed) {
      console.log('[Debate] Turn state auto-fixed for debate:', this._id);
    }
  }

  next();
});

module.exports = mongoose.model('Debate', debateSchema);
