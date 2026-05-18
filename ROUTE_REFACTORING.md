# Debates Route Refactoring Guide

## Problem Analysis

The original `backend/routes/debates.js` file is ~2100+ lines, making it difficult to:

- Navigate and locate specific functionality
- Test individual concerns
- Reuse helper functions
- Understand the overall structure at a glance

## Solution: Modular Architecture

### Phase 1: ✅ Service Extraction (COMPLETED)

**File**: `backend/services/debateService.js` (NEW)

All business logic and helper functions extracted from routes:

- `determineFirstPlayer()` - First player selection logic
- `calculateRound0BeliefValue()` - Pre-survey to belief conversion
- `initializeRound0Beliefs()` - Round 0 belief initialization
- `generateAIPostSurvey()` - AI survey generation
- `completeDebateEarly()` - Early debate completion
- `maybeAdvanceRoundAfterBeliefs()` - Round progression logic
- `recordAIBeliefUpdate()` - AI belief tracking
- Plus 8 other utility functions

**Benefits:**

- Routes file now imports from service instead of defining locally
- Functions can be reused in other files
- Easier to test logic independently
- Clear separation of concerns

### Phase 2: Controller Layer (RECOMMENDED NEXT)

Split route handlers into logical controller files:

```
backend/controllers/
├── debateController.js       # Core gameplay (join, create, list)
├── argumentController.js     # Argument submission & management
├── beliefController.js       # Belief updates & reflection
├── surveyController.js       # Pre/post survey handling
├── adminController.js        # Admin operations (match AI, pause, etc.)
└── earlyEndController.js     # Early end voting logic
```

**Example - debateController.js**:

```javascript
const debateService = require("../services/debateService");
const Debate = require("../models/Debate");

/**
 * Create or join a debate
 * POST /api/debates/join
 */
exports.joinDebate = async (req, res) => {
  try {
    // Existing join logic here
    // Calls debateService functions as needed
  } catch (error) {
    // Error handling
  }
};

/**
 * List all debates (admin)
 * GET /api/debates/all-debates
 */
exports.getAllDebates = async (req, res) => {
  // Existing logic
};

// ... other controllers
```

### Phase 3: Route Organization (RECOMMENDED)

Split into separate route files by concern:

```
backend/routes/
├── debates.js              # Main route registration (entry point)
├── debateRoutes.js         # Core gameplay routes
├── argumentRoutes.js       # Argument-related routes
├── beliefRoutes.js         # Belief & reflection routes
├── surveyRoutes.js         # Survey routes
├── adminRoutes.js          # Admin-only routes
└── earlyEndRoutes.js       # Early end voting routes
```

**Example - routes/argumentRoutes.js**:

```javascript
const express = require("express");
const router = express.Router({ mergeParams: true });
const authenticate = require("../middleware/auth");
const argumentController = require("../controllers/argumentController");

// Submit argument
router.post(
  "/:debateId/argument",
  authenticate,
  argumentController.submitArgument,
);

// Get debate arguments
router.get(
  "/:debateId/arguments",
  authenticate,
  argumentController.getArguments,
);

module.exports = router;
```

**Example - routes/debates.js (entry point)**:

```javascript
const express = require("express");
const router = express.Router();

// Import sub-routers
const debateRoutes = require("./debateRoutes");
const argumentRoutes = require("./argumentRoutes");
const beliefRoutes = require("./beliefRoutes");
const surveyRoutes = require("./surveyRoutes");
const adminRoutes = require("./adminRoutes");
const earlyEndRoutes = require("./earlyEndRoutes");

// Mount sub-routers
router.use("/", debateRoutes); // /api/debates/topics, /api/debates/join
router.use("/", argumentRoutes); // /api/debates/:id/argument
router.use("/", beliefRoutes); // /api/debates/:id/belief-update
router.use("/", surveyRoutes); // /api/debates/:id/pre-survey, /post-survey
router.use("/admin", adminRoutes); // /api/debates/admin/*
router.use("/", earlyEndRoutes); // /api/debates/:id/vote-end

module.exports = router;
```

### Phase 4: AI-Related Logic (OPTIONAL ADVANCED)

Extract AI-specific logic into dedicated service:

**File**: `backend/services/aiDebateService.js`

```javascript
// AI-specific debate operations
exports.calculateAIVoteStrategy = (debate) => { ... };
exports.handleAIEarlyEndVote = async (debate, io) => { ... };
exports.calculateAIResponseDelay = (argumentLength, debate, personality) => { ... };
exports.triggerAIResponse = async (debateId, io) => { ... };
```

## Current State & Recommendations

### ✅ What's Done

- Service layer extracted (`debateService.js`)
- All helper functions centralized
- Routes can be simplified

### 📋 What to Do Next

**Quick Win (1-2 hours)**:

1. Update imports in `routes/debates.js` to use `debateService`
2. Remove duplicate function definitions from routes file
3. Test that everything still works

**Medium Effort (4-6 hours)**:

1. Create `controllers/` directory
2. Move route handler logic into controller files
3. Update routes to call controllers
4. Add JSDoc comments to controllers

**Full Refactor (8-12 hours)**:

1. Split routes into logical files under `routes/`
2. Create admin routes prefix
3. Organize by concern (gameplay, surveys, admin, etc.)
4. Update server.js route registration

## File Size Breakdown (Current)

| Concern            | Lines | Priority               |
| ------------------ | ----- | ---------------------- |
| Helpers/Services   | ~400  | ✅ Extracted           |
| Join/Create        | ~250  | High (Core logic)      |
| Arguments          | ~180  | High (Gameplay)        |
| Beliefs/Reflection | ~220  | High (Data collection) |
| Surveys            | ~150  | Medium (Setup/Cleanup) |
| Admin Operations   | ~200  | Medium (Control)       |
| Early End Voting   | ~200  | Medium (Rare flow)     |
| Analytics          | ~80   | Low (Reporting)        |

## Migration Checklist

### For Phase 2 (Controllers)

- [ ] Create `backend/controllers/` directory
- [ ] Create individual controller files
- [ ] Move route handlers to controllers
- [ ] Update routes to import and use controllers
- [ ] Test all endpoints work
- [ ] Update IMPROVEMENTS.md with new structure

### For Phase 3 (Route Organization)

- [ ] Create individual route files in `routes/`
- [ ] Move route definitions to appropriate files
- [ ] Create main `debates.js` router that mounts sub-routers
- [ ] Update `server.js` to use new structure
- [ ] Test routing still works
- [ ] Update API_REFERENCE.md if needed

### For Phase 4 (AI Service)

- [ ] Extract AI-specific functions to `services/aiDebateService.js`
- [ ] Update imports throughout codebase
- [ ] Test AI operations
- [ ] Consider rate limiting in new service layer

## Benefits of Refactoring

### Before

```
debates.js: 2100+ lines
├── Helpers: 400 lines
├── Route handlers: 1500+ lines mixed together
└── Tests: Difficult to isolate behavior
```

### After (Phase 3)

```
debateRoutes.js: 150 lines (core gameplay)
argumentRoutes.js: 100 lines (argument submission)
beliefRoutes.js: 120 lines (belief updates)
surveyRoutes.js: 100 lines (surveys)
adminRoutes.js: 150 lines (admin operations)
earlyEndRoutes.js: 120 lines (voting)
    +
services/debateService.js: 400 lines (logic)
services/aiDebateService.js: 300 lines (AI logic)
controllers/debateController.js: 200 lines
controllers/argumentController.js: 150 lines
controllers/beliefController.js: 150 lines
controllers/surveyController.js: 150 lines
controllers/adminController.js: 150 lines
```

**Total**: ~2000 lines (same content, better organized)

### Advantages

✅ Each file <200 lines, easier to navigate
✅ Clear separation of concerns
✅ Easy to find specific functionality
✅ Reusable logic in service layer
✅ Testable components
✅ Scalable architecture

## Code Example: Before → After

### Before (in debates.js)

```javascript
// 50 lines of helper logic mixed with routes
const determineFirstPlayer = (debate) => { ... };
const getExpectedNextTurn = (debate) => { ... };
const mapBeliefCategoryToNumeric = (category) => { ... };

// Route handler with inline logic
router.post('/:debateId/argument', authenticate, async (req, res) => {
  // 80 lines of validation, business logic, and response handling
  try {
    const { text } = req.body;
    // ... 75 lines later
    res.json({ debate });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit argument' });
  }
});
```

### After

```javascript
// services/debateService.js
exports.getExpectedNextTurn = (debate) => { ... };

// controllers/argumentController.js
exports.submitArgument = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { text } = req.body;

    const result = await argumentService.submitArgument(debateId, text, req.user);
    res.json({ debate: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// routes/argumentRoutes.js
router.post('/:debateId/argument', authenticate, argumentController.submitArgument);
```

## Next Steps

1. **Now**: Update current route handlers to import from `debateService.js`
2. **Next**: Create controller layer (Phase 2)
3. **Then**: Split routes into organized files (Phase 3)
4. **Later**: Consider extracting AI-specific logic (Phase 4)

---

## Questions?

- See [ONBOARDING.md](../ONBOARDING.md) for project overview
- Check `backend/routes/debates.js` for current state
- Refer to Node.js best practices for MVC patterns
