# Debate Platform - Data Model Reference

Complete reference for the Debate data model and related schemas.

## Overview

The Debate model is the **core data structure** for this platform. It represents a single debate session between two participants (human-human, human-AI, or observer patterns).

## Debate Schema

### Metadata Fields

```javascript
{
  // Topic Information
  topicId: Number,              // Reference to debate topic (1-10)
  topicQuestion: String,         // Full question text: "Should AI be regulated?"

  // Game Configuration
  gameMode: 'human-human' | 'human-ai',
  maxRounds: Number,            // Max debate rounds (default: 10)
  aiResponseDelay: Number,      // Delay before AI responds in seconds (default: 10)

  // Timestamps
  createdAt: Date,              // When debate was created
  startedAt: Date,              // When second player joined (null if waiting)
  completedAt: Date,            // When debate finished (null if active)

  // Status & Lifecycle
  status: 'waiting' | 'active' | 'survey_pending' | 'completed' | 'abandoned',
  completionReason: String,     // Why debate ended (if completed)
}
```

---

### Player 1 (Always Human)

```javascript
{
  // Identity
  player1UserId: ObjectId,      // Reference to User model

  // Stance Configuration
  player1Stance: 'for' | 'against',  // Assigned stance for debate
  player1StanceChoice: 'for' | 'against' | 'unsure',  // Personal belief before debate

  // Survey Responses
  preDebateSurvey: {
    player1: {
      stance: 'for' | 'against' | 'unsure',
      confidence: 1-10,
      reasoning: String
    }
  },
  postDebateSurvey: {
    player1: {
      stance: 'for' | 'against' | 'unsure',
      confidence: 1-10,
      persuaded: Boolean,       // Did opponent persuade you?
      persuasiveness: 1-10,     // How persuasive was opponent?
      reasoning: String
    }
  }
}
```

---

### Player 2 (Human or AI)

```javascript
{
  // Type & Identity
  player2Type: 'human' | 'ai',
  player2UserId: ObjectId,      // NULL if AI opponent

  // AI Configuration (only if player2Type === 'ai')
  player2AIModel: String,       // 'balanced-debater', 'firm-debater', etc.
  player2AIPrompt: String,      // Custom system prompt (overrides default)
  aiEnabled: Boolean,           // Can admin toggle AI responses? (default: true)
  aiLastResponseAt: Date,       // When AI last generated argument

  // Stance & Beliefs
  player2Stance: 'for' | 'against',
  player2StanceChoice: 'for' | 'against' | 'unsure',

  // Surveys
  preDebateSurvey: {
    player2: {
      // For human: normal survey responses
      // For AI: auto-generated from personality
      stance: 'for' | 'against' | 'unsure',
      confidence: 1-10,
      reasoning: String
    }
  },
  postDebateSurvey: {
    player2: {
      // For human: normal survey responses
      // For AI: auto-generated from debate arguments
      stance: 'for' | 'against' | 'unsure',
      confidence: 1-10,
      persuaded: Boolean,
      persuasiveness: 1-10,
      reasoning: String
    }
  }
}
```

---

### Debate Flow & Turn Management

```javascript
{
  // Round Tracking
  currentRound: Number,         // Current debate round (1-10)
  firstPlayer: 'for' | 'against',    // Who argues first
  firstPlayerPreference: 'for' | 'against' | 'random',  // Admin can override
  nextTurn: 'for' | 'against' | null,  // Whose turn to argue next

  // State Machine
  status: {
    waiting:        // Created, waiting for opponent
    active:         // Both players present, collecting arguments
    survey_pending: // Debate ended, collecting surveys
    completed:      // All data collected, debate finalized
    abandoned:      // Error or timeout occurred
  }
}
```

#### Turn State Examples

```
Round 1, no arguments:
  firstPlayer = 'for'
  nextTurn = 'for'

Round 1, after 'for' argues:
  nextTurn = 'against'

Round 1, after both argue:
  nextTurn = null (awaiting belief submission)

After beliefs submitted:
  currentRound = 2
  nextTurn = 'for'
  firstPlayer = 'for'

Round 2, no arguments:
  nextTurn = 'for'
```

---

### Belief Tracking

```javascript
{
  // Categorical Beliefs
  currentBelief: {
    player1: 'for' | 'against' | 'unsure',
    player2: 'for' | 'against' | 'unsure'
  },

  // Numeric Beliefs (0-100 scale for fine-grained measurement)
  currentBeliefValue: {
    player1: 0-100,  // 0 = against, 50 = unsure, 100 = for
    player2: 0-100
  },

  // Belief History (tracks changes over rounds)
  beliefHistory: [
    {
      round: 1,
      player1: { stance: 'for', value: 65 },
      player2: { stance: 'against', value: 35 }
    },
    {
      round: 2,
      player1: { stance: 'for', value: 72 },
      player2: { stance: 'unsure', value: 50 }
    }
  ]
}
```

---

### Arguments

```javascript
{
  arguments: [
    {
      _id: ObjectId,
      stance: "for" | "against",
      round: 1,
      text: "Argument content...",
      characterCount: 450,
      createdAt: Date,

      // For AI arguments only:
      generatedBy: "openai" | "fallback",
      model: "gpt-4o-mini",
      tokens: { prompt: 45, completion: 120 },
    },
  ];
}
```

#### Argument Submission Rules

- **Timing**: Only allowed when `nextTurn` matches player's stance
- **Length**: 250-4000 characters
- **Frequency**: Only one per turn
- **Required**: Both players must argue before round advances

---

### Early End Voting

```javascript
{
  earlyEndVotes: {
    player1: null | true | false,  // null = not voted, true = wants end, false = wants continue
    player2: null | true | false,
    initiated: Date,              // When voting started
    expired: Boolean              // Did vote timeout?
  }
}
```

#### Early End Logic

- Any player can initiate vote to end early
- Both must vote `true` to end debate
- If vote active for >30 seconds with disagreement, reverts
- Mutual consent → debate transitions to survey collection

---

### Complete Field Reference

| Field              | Type     | Required | Default   | Notes                        |
| ------------------ | -------- | -------- | --------- | ---------------------------- |
| `topicId`          | Number   | Yes      | -         | 1-10                         |
| `topicQuestion`    | String   | Yes      | -         | Full question text           |
| `gameMode`         | String   | Yes      | -         | 'human-human' or 'human-ai'  |
| `player1UserId`    | ObjectId | Yes      | -         | Reference to User            |
| `player1Stance`    | String   | Yes      | -         | 'for' or 'against'           |
| `player2Type`      | String   | No       | null      | 'human' or 'ai'              |
| `player2UserId`    | ObjectId | No       | null      | Reference to User (if human) |
| `player2AIModel`   | String   | No       | null      | AI personality (if AI)       |
| `status`           | String   | Yes      | 'waiting' | Lifecycle state              |
| `currentRound`     | Number   | Yes      | 1         | 1 to maxRounds               |
| `maxRounds`        | Number   | Yes      | 10        | Default 10                   |
| `firstPlayer`      | String   | No       | null      | 'for' or 'against'           |
| `nextTurn`         | String   | No       | null      | 'for', 'against', or null    |
| `arguments`        | Array    | Yes      | []        | Array of argument objects    |
| `currentBelief`    | Object   | Yes      | {}        | Belief snapshot              |
| `preDebateSurvey`  | Object   | Yes      | {}        | Pre-debate surveys           |
| `postDebateSurvey` | Object   | Yes      | {}        | Post-debate surveys          |
| `createdAt`        | Date     | Auto     | now       | Timestamp                    |
| `startedAt`        | Date     | No       | null      | When debate activated        |
| `completedAt`      | Date     | No       | null      | When debate ended            |

---

## State Transitions

```
┌─────────┐
│ waiting │  ← New debate created, waiting for opponent
└────┬────┘
     │ (player 2 joins OR AI auto-matched)
     ▼
┌─────────┐
│ active  │  ← Both players present, collecting arguments
└────┬────┘
     │ (max rounds reached OR mutual early end vote)
     ▼
┌────────────────┐
│ survey_pending │  ← Debate ended, collecting surveys
└────┬───────────┘
     │ (surveys collected)
     ▼
┌───────────┐
│ completed │  ← All data archived
└───────────┘

        (error or critical timeout)
             ▼
      ┌───────────┐
      │ abandoned │
      └───────────┘
```

---

## Validation Rules

### Turn State Validation

The system enforces these turn state invariants (see `turnValidator.js`):

1. **Waiting debates** have `nextTurn = null`
2. **Active debates with 0 arguments** have `nextTurn = firstPlayer`
3. **Active debates with 1 argument** have `nextTurn = opposite_stance`
4. **Active debates with 2 arguments** have `nextTurn = null` (awaiting belief)
5. **Abandoned/completed** have `nextTurn = null`

### Belief Value Validation

- Must be integer 0-100
- 0-25: "against"
- 26-49: "against-leaning"
- 50: "unsure"
- 51-74: "for-leaning"
- 75-100: "for"

### Argument Validation

- Length: 250-4000 characters
- Submitted by correct player (matching `nextTurn`)
- Round number matches `currentRound`
- Only one argument per player per round

---

## Indexes (Database)

For performance, these indexes are recommended:

```javascript
// Primary queries
db.debates.createIndex({ status: 1 });
db.debates.createIndex({ player1UserId: 1, createdAt: -1 });
db.debates.createIndex({ player2UserId: 1, createdAt: -1 });

// Admin dashboard
db.debates.createIndex({ createdAt: -1 });
db.debates.createIndex({ status: 1, createdAt: -1 });

// Cleanup jobs
db.debates.createIndex({ status: 1, updatedAt: 1 });
db.debates.createIndex({ status: 1, startedAt: 1 });
```

---

## Common Query Patterns

### Get active debates for a user

```javascript
db.debates.find({
  $or: [{ player1UserId: userId }, { player2UserId: userId }],
  status: "active",
});
```

### Get completed debates with belief changes

```javascript
db.debates.find({
  status: "completed",
  $expr: {
    $ne: [
      { $arrayElemAt: ["$beliefHistory.player1.stance", 0] },
      { $arrayElemAt: ["$beliefHistory.player1.stance", -1] },
    ],
  },
});
```

### Find debates stuck in survey_pending

```javascript
db.debates.find({
  status: "survey_pending",
  "postDebateSurvey.player1": null,
  completedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // > 24h old
});
```

---

## Data Integrity Checks

Run these queries periodically to check data health:

```javascript
// Debates with invalid status
db.debates.find({
  $or: [
    {
      status: {
        $nin: ["waiting", "active", "survey_pending", "completed", "abandoned"],
      },
    },
    { currentRound: { $lt: 1 } },
    { currentRound: { $gt: 100 } },
    { arguments: { $size: { $gt: 1000 } } }, // Too many arguments
  ],
});

// Debates with missing required fields
db.debates.find({
  $or: [
    { topicId: { $exists: false } },
    { player1UserId: { $exists: false } },
    { gameMode: { $exists: false } },
  ],
});

// Turn state violations (manual check)
db.debates.find({ status: "active", nextTurn: null }).limit(100);
```

---

## Example Documents

### Human-Human Debate (Waiting)

```javascript
{
  _id: ObjectId("..."),
  topicId: 1,
  topicQuestion: "Should artificial intelligence be regulated?",
  gameMode: "human-human",

  player1UserId: ObjectId("user1"),
  player1Stance: "for",
  player1StanceChoice: "for",

  player2Type: null,
  player2UserId: null,

  status: "waiting",
  currentRound: 1,
  maxRounds: 10,
  firstPlayer: null,
  nextTurn: null,

  arguments: [],
  preDebateSurvey: {},
  postDebateSurvey: {},

  currentBelief: {},
  currentBeliefValue: {},

  createdAt: ISODate("2024-05-18T10:30:00Z"),
  startedAt: null,
  completedAt: null
}
```

### Human-AI Debate (Active, Round 1)

```javascript
{
  _id: ObjectId("..."),
  topicId: 1,
  topicQuestion: "Should artificial intelligence be regulated?",
  gameMode: "human-ai",

  player1UserId: ObjectId("user1"),
  player1Stance: "for",
  player1StanceChoice: "for",

  player2Type: "ai",
  player2AIModel: "balanced-debater",
  player2AIPrompt: null,
  player2Stance: "against",
  aiEnabled: true,
  aiResponseDelay: 10,

  status: "active",
  currentRound: 1,
  maxRounds: 10,
  firstPlayer: "for",
  nextTurn: "against",  // AI's turn to respond

  arguments: [
    {
      _id: ObjectId("..."),
      stance: "for",
      round: 1,
      text: "AI regulation is crucial because...",
      characterCount: 342,
      createdAt: ISODate("2024-05-18T10:35:00Z")
    }
  ],

  preDebateSurvey: {
    player1: {
      stance: "for",
      confidence: 7,
      reasoning: "Tech companies should be accountable"
    },
    player2: {
      stance: "against",
      confidence: 6,
      reasoning: "Regulation stifles innovation"
    }
  },

  currentBelief: {
    player1: "for",
    player2: "against"
  },
  currentBeliefValue: {
    player1: 70,
    player2: 40
  },

  createdAt: ISODate("2024-05-18T10:30:00Z"),
  startedAt: ISODate("2024-05-18T10:33:00Z"),
  completedAt: null
}
```

### Completed Debate

```javascript
{
  _id: ObjectId("..."),
  // ... all fields as above ...

  status: "completed",
  completedAt: ISODate("2024-05-18T11:15:00Z"),

  arguments: [
    // 20 arguments (10 per player, 10 rounds)
    { stance: "for", round: 1, text: "..." },
    { stance: "against", round: 1, text: "..." },
    { stance: "for", round: 2, text: "..." },
    { stance: "against", round: 2, text: "..." },
    // ...
  ],

  beliefHistory: [
    {
      round: 1,
      player1: { stance: "for", value: 70 },
      player2: { stance: "against", value: 40 }
    },
    {
      round: 2,
      player1: { stance: "for", value: 75 },
      player2: { stance: "unsure", value: 50 }
    },
    // ... through round 10
  ],

  postDebateSurvey: {
    player1: {
      stance: "for",
      confidence: 8,
      persuaded: false,
      persuasiveness: 6,
      reasoning: "Good points but didn't change my mind"
    },
    player2: {
      stance: "for",
      confidence: 7,
      persuaded: true,
      persuasiveness: 8,
      reasoning: "Opponent made strong regulation arguments"
    }
  }
}
```

---

## Modifying the Schema

### Adding a New Field

1. Add field to `models/Debate.js` schema
2. Write migration in `scripts/` if existing debates need it
3. Update model tests
4. Update this documentation
5. Deploy

### Example Migration

See `scripts/backfillNextTurn.js` for the pattern:

```javascript
// scripts/addNewField.js
const mongoose = require("mongoose");
const Debate = require("../models/Debate");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await Debate.updateMany(
    {},
    { $set: { newField: defaultValue } },
  );

  console.log(`Updated ${result.modifiedCount} debates`);
  process.exit(0);
})();
```

---

## Questions?

- See `ONBOARDING.md` for setup & debugging
- See `API_REFERENCE.md` for endpoint usage
- See `backend/routes/debates.js` for implementation
- See `backend/utils/turnValidator.js` for validation logic
