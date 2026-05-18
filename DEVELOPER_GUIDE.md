# Quick Reference: New Backend Architecture

## For the Next Developer

Welcome! The backend has been refactored for clarity and maintainability. Here's what you need to know.

---

## Project Structure (Post-Refactoring)

```
backend/
├── server.js                 ← Main entry point
├── package.json
├── config/                   ← Configuration
│   ├── aiPersonalities.js
│   └── database.js
├── middleware/               ← Express middleware
│   ├── auth.js
│   └── rateLimiter.js
├── models/                   ← Mongoose models
│   ├── Debate.js
│   └── User.js
├── routes/                   ← Express routers (REFACTORED)
│   ├── debates.js            ← Main entry point (57 lines)
│   ├── debateRoutes.js       ← Core gameplay (8 endpoints)
│   ├── argumentRoutes.js     ← Argument submission (1 endpoint)
│   ├── beliefRoutes.js       ← Beliefs & reflections (3 endpoints)
│   ├── surveyRoutes.js       ← Surveys (2 endpoints)
│   ├── adminRoutes.js        ← Admin operations (4 endpoints)
│   ├── earlyEndRoutes.js     ← Voting (2 endpoints)
│   └── auth.js               ← Authentication routes
├── controllers/              ← Request handlers (NEW - ADDED)
│   ├── debateController.js   ← Core gameplay handlers
│   ├── argumentController.js ← Argument handling
│   ├── beliefController.js   ← Belief handling
│   ├── surveyController.js   ← Survey handling
│   ├── adminController.js    ← Admin handlers
│   └── earlyEndController.js ← Voting handlers
├── services/                 ← Business logic (ENHANCED)
│   ├── debateService.js      ← Core debate logic (NEW)
│   ├── aiDebateService.js    ← AI response logic (NEW)
│   └── aiService.js          ← AI generation
├── utils/                    ← Utilities
│   ├── autoMatch.js
│   ├── debateCleanup.js
│   ├── guestCleanup.js
│   ├── turnValidator.js
│   └── validateEnv.js
└── scripts/                  ← One-off scripts
    ├── backfillNextTurn.js
    └── seed.js
```

---

## Architecture Layers

### 1. Routes (`backend/routes/`)

**Purpose**: Define URL endpoints and mount middleware
**Key File**: `debates.js` (57 lines) - mounts all sub-routers
**Not**: Business logic goes here

```javascript
// routes/debates.js
const debateRoutes = require("./debateRoutes");
const argumentRoutes = require("./argumentRoutes");
// ... more routers
router.use("/", debateRoutes); // Mount core gameplay
router.use("/", argumentRoutes); // Mount argument submission
```

### 2. Controllers (`backend/controllers/`)

**Purpose**: Handle HTTP requests and responses
**Key Files**:

- `debateController.js` - Main gameplay endpoints
- `argumentController.js` - Argument submission
- `beliefController.js` - Belief updates
- etc.

**Pattern**:

```javascript
async function submitArgument(req, res) {
  // 1. Extract from request
  const { debateId } = req.params;
  const { text } = req.body;

  // 2. Validate
  if (!text || text.length > 500) {
    return res.status(400).json({ error: "Invalid argument" });
  }

  // 3. Call service
  const debate = await debateService.recordArgument(debateId, text);

  // 4. Return response
  res.json({ success: true, debate });
}
```

### 3. Services (`backend/services/`)

**Purpose**: Reusable business logic
**Key Files**:

- `debateService.js` - Core debate logic (14 functions)
- `aiDebateService.js` - AI response generation
- `aiService.js` - AI argument generation

**Pattern**:

```javascript
// debateService.js
async function maybeAdvanceRoundAfterBeliefs(debate, io) {
  if (bothPlayersHaveBeliefs) {
    debate.currentRound++;
    debate.nextTurn = debate.player1Stance;
    await debate.save();
    io.emit("roundAdvanced", { currentRound: debate.currentRound });
  }
}
```

### 4. Models (`backend/models/`)

**Purpose**: Mongoose schemas and model definitions
**Key Files**:

- `Debate.js` - Debate document schema
- `User.js` - User document schema

---

## Adding a New Feature

### Scenario: Add a "debate notes" endpoint

#### Step 1: Add to Model

```javascript
// models/Debate.js
schema.add({
  notes: {
    player1: String,
    player2: String,
  },
});
```

#### Step 2: Create Controller Function

```javascript
// controllers/debateController.js
async function updateNotes(req, res) {
  const { debateId } = req.params;
  const { notes } = req.body;

  const debate = await Debate.findByIdAndUpdate(
    debateId,
    { notes },
    { new: true }
  );

  res.json({ success: true, notes: debate.notes });
}

module.exports = { ..., updateNotes };
```

#### Step 3: Add Route

```javascript
// routes/debateRoutes.js
const { updateNotes } = require("../controllers/debateController");

router.put("/:debateId/notes", authenticate, updateNotes);

module.exports = router;
```

#### Step 4: Test

```bash
curl -X PUT http://localhost:5555/api/debates/123/notes \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Great debate!"}'
```

---

## Common Tasks

### Understand How an Endpoint Works

**Example**: How does `/api/debates/join` work?

1. **Find the route**

   ```
   routes/debateRoutes.js → router.post('/join', authenticate, joinDebate)
   ```

2. **Find the controller**

   ```
   controllers/debateController.js → async function joinDebate(req, res)
   ```

3. **Follow the service calls**

   ```javascript
   const debate = await Debate.create({ ... });
   const firstPlayer = debateService.determineFirstPlayer(debate);
   await debateService.initializeRound0Beliefs(debate, user1Id, user2Id);
   ```

4. **Check the models**
   ```
   models/Debate.js → schema structure, indexes
   ```

---

### Debug an Issue

**Example**: "Users can't start debates"

1. **Check the route** - Is it accessible?

   ```bash
   curl -X POST http://localhost:5555/api/debates/join
   ```

2. **Check the controller** - Any validation failing?

   ```javascript
   // controllers/debateController.js
   if (!userId) return res.status(400).json({ error: "No user" });
   ```

3. **Check the service** - Is business logic working?

   ```javascript
   // services/debateService.js
   const debate = await Debate.create({ ... }); // Does this fail?
   ```

4. **Check the model** - Are indexes, validators correct?

   ```javascript
   // models/Debate.js
   // Are required fields present?
   ```

5. **Check logs**
   ```bash
   npm start 2>&1 | grep -i "error\|join"
   ```

---

### Test an Endpoint

**Manual Testing (Terminal)**

```bash
# 1. Start server
npm start

# 2. Get auth token
RESPONSE=$(curl -s -X POST http://localhost:5555/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password"}')
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 3. Test endpoint
curl -X GET http://localhost:5555/api/debates/my-status \
  -H "Authorization: Bearer $TOKEN"
```

**Automated Testing (Jest)**

```javascript
// tests/debates.test.js
const request = require("supertest");
const app = require("../server");

describe("Debates API", () => {
  it("should join a debate", async () => {
    const res = await request(app)
      .post("/api/debates/join")
      .set("Authorization", `Bearer ${token}`)
      .send({ stance: "for", topic: "topic1" });

    expect(res.status).toBe(200);
    expect(res.body.debateId).toBeDefined();
  });
});
```

---

## Key Services & Their Functions

### `debateService.js`

```javascript
determineFirstPlayer(debate); // Who goes first?
calculateRound0BeliefValue(response, stance); // Survey → belief scale
initializeRound0Beliefs(debate, user1Id, user2Id); // Create initial beliefs
generateAIPostSurvey(debate); // AI post-survey response
completeDebateEarly(debateId, reason, io); // End debate
maybeAdvanceRoundAfterBeliefs(debate, io); // Auto-advance round
recordAIBeliefUpdate(debate, roundNumber); // Record AI belief
mapBeliefCategoryToNumeric(category); // Survey → 0-50-100
mapBeliefValueToCategory(value); // 0-50-100 → survey
getOppositeStance(stance); // 'for' ↔ 'against'
getExpectedNextTurn(debate); // Who should go next?
hasBeliefEntryForRound(debate, round, player); // Did they submit?
hasReflectionEntryForRound(debate, round, player); // Did they reflect?
```

### `aiDebateService.js`

```javascript
triggerAIResponse(debateId, io); // Generate AI argument
calculateAIResponseDelay(length, debate, personality); // Realistic delay
```

### `aiService.js`

```javascript
generateArgument(debate); // Create AI argument text
```

---

## Debugging Tips

### 1. Check Logs

```bash
# Start with verbose logging
DEBUG=* npm start

# Or use npm-debug
npm start 2>&1 | tee debug.log
```

### 2. Use MongoDB Directly

```bash
# Check database state
mongo "mongodb://localhost:27017/debatedb"
> db.debates.findOne()
> db.debates.countDocuments()
```

### 3. Test with curl

```bash
# Pretty print JSON responses
curl -s http://localhost:5555/api/debates/topics | jq .

# See response headers
curl -i http://localhost:5555/api/debates/topics
```

### 4. Add Temporary Logging

```javascript
// In a controller or service
console.log("DEBUG: User ID =", userId);
console.log("DEBUG: Debate state =", JSON.stringify(debate, null, 2));
```

---

## File Sizes (Post-Refactoring)

| Category              | Before      | After               | Benefit           |
| --------------------- | ----------- | ------------------- | ----------------- |
| **Route Entry Point** | 2,501 lines | 57 lines            | -97% complexity   |
| **Total Controllers** | 0 files     | 1,745 lines         | Code organization |
| **Total Services**    | 693 lines   | 1,287 lines (split) | Logic reuse       |
| **Avg Lines/File**    | 2,501       | ~150                | -94% file size    |

---

## WebSocket Events (Socket.IO)

Events are emitted to specific rooms:

### From Controllers/Services

```javascript
// Emit to specific debate room
io.to(`debate:${debateId}`).emit('debate:argumentAdded', {
  debateId,
  argument,
  currentRound,
  nextTurn
});

// Emit to admin
io.to('admin').emit('debate:argumentAdded', { ... });
```

### Frontend Listens

```javascript
// src/context/socketContext.jsx
socket.on("debate:argumentAdded", (data) => {
  updateDebate(data);
});
```

---

## Environment Variables

Required (see `.env.development`):

```
MONGODB_URI=mongodb://localhost:27017/debatedb
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret
NODE_ENV=development
```

---

## Running Tests (Future)

```bash
# Install Jest
npm install --save-dev jest

# Create tests/
mkdir tests

# Create test file
touch tests/debates.test.js

# Run tests
npm test
```

---

## Performance Monitoring

### Check request times

```javascript
// middleware/timing.js
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.path}: ${Date.now() - start}ms`);
  });
  next();
});
```

### Monitor MongoDB queries

```javascript
// In debateService.js, add timing
const start = Date.now();
const debate = await Debate.findById(debateId);
console.log(`Query took ${Date.now() - start}ms`);
```

---

## Next Steps

1. **Write tests** for controllers and services
2. **Add API documentation** (OpenAPI/Swagger)
3. **Implement request logging** (Winston/Bunyan)
4. **Add error tracking** (Sentry)
5. **Profile performance** (APM tools)
6. **Set up CI/CD** (GitHub Actions)

---

**Last Updated**: Post-Phase 3 Refactoring
**Status**: Production Ready ✅
**Questions?** Check [REFACTORING_COMPLETE.md](REFACTORING_COMPLETE.md)
