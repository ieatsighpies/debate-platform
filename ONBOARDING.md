# Debate Platform - Developer Onboarding Guide

Welcome to the Debate Platform! This guide is designed to get new developers up to speed quickly.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [Architecture Overview](#architecture-overview)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Key Concepts](#key-concepts)
7. [Setup Instructions](#setup-instructions)
8. [Common Development Tasks](#common-development-tasks)
9. [Debugging & Troubleshooting](#debugging--troubleshooting)
10. [Important Files & Resources](#important-files--resources)

---

## Project Overview

**Debate Platform** is a real-time web application that enables structured debates between human participants and/or AI opponents. Key features include:

- **Real-time debate interactions** using WebSocket (Socket.IO)
- **AI-powered debate opponents** (OpenAI GPT-4o mini with custom personalities)
- **Multi-modal evidence**: arguments, belief surveys, and persuasion metrics
- **Admin dashboard** for monitoring, matchmaking, and debate management
- **Guest & authenticated sessions** with JWT-based authentication
- **Research-grade data collection** for studying persuasion dynamics

### Research Context

This platform was built as part of a Final Year Project (FYP) studying persuasion in human-AI debates. See `fyp-data/fyp-report/` for the full thesis and analysis.

---

## Quick Start (Recommended: Docker)

The fastest way to get running is with Docker Compose. See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed guide.

### With Docker (3 steps)

```bash
# 1. Start all services
docker compose up

# 2. Wait for services to be healthy (~30-60 seconds)
# 3. Open http://localhost:5173 in your browser ✓
```

That's it! Docker handles MongoDB, backend, and frontend automatically.

### Without Docker (Manual Setup)

#### 1. Install Dependencies

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

#### 2. Configure Environment

```bash
# Backend: Create .env.development from .env.example
cd ../backend
cp .env.example .env.development
# Edit .env.development with your MongoDB URI, OpenAI key, etc.

# Frontend: Update config.js with backend URL
cd ../frontend
# Edit src/config.js to point to your backend (http://localhost:3000)
```

#### 3. Start Development Servers

```bash
# Terminal 1: Backend (from /backend)
npm run dev

# Terminal 2: Frontend (from /frontend)
npm run dev
```

#### 4. Access the Platform

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Admin Dashboard**: Login with admin credentials

---

## Running with Docker

See [DOCKER_SETUP.md](DOCKER_SETUP.md) for comprehensive Docker guide including:

- Service configuration & ports
- Development workflow
- Debugging techniques
- Production deployment
- Troubleshooting

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React)                          │
│  Login → Admin Dashboard OR Participant Dashboard               │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP + WebSocket (Socket.IO)
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                  Express Server (Node.js)                        │
│  Routes: /api/auth, /api/debates                                │
│  Real-time: Socket handlers (join/leave/events)                 │
│  Services: AI service (OpenAI integration)                       │
│  Background jobs: Auto-matching, cleanup                         │
└────────────────────┬────────────────────────────────────────────┘
                     │ Mongoose ODM
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                    MongoDB Database                              │
│  Collections: users, debates, sessions                           │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Creating & Running a Debate

1. **User joins debate** → REST endpoint (`POST /api/debates/join`)
2. **Backend validates & creates Debate document**
3. **Server broadcasts** `debate:created` to admin room
4. **Second player joins** → Debate starts, `debate:started` emitted
5. **Player submits argument** → REST endpoint with validation
6. **Backend broadcasts** `debate:argumentAdded` to debate room
7. **If AI opponent** → AI service generates response after delay
8. **Round advances** when both sides have argued
9. **Debate ends** → Survey collection & data persistence

---

## Technology Stack

| Layer        | Technology            | Purpose                         |
| ------------ | --------------------- | ------------------------------- |
| **Frontend** | React 18.2 + Vite     | UI, real-time updates           |
|              | TailwindCSS           | Styling                         |
|              | Socket.IO Client      | WebSocket communication         |
|              | React Router          | Client-side routing             |
| **Backend**  | Node.js + Express 5.1 | REST API, server logic          |
|              | Socket.IO 4.8         | Real-time events                |
|              | Mongoose 8.19         | MongoDB ODM & schema            |
| **Database** | MongoDB               | Document store (debates, users) |
| **AI**       | OpenAI API            | GPT-4o mini for AI opponent     |
| **Auth**     | JWT                   | Stateless authentication        |

---

## Project Structure

```
debate-platform/
├── backend/                    # Express server & business logic
│   ├── config/
│   │   ├── database.js        # MongoDB connection
│   │   ├── aiPersonalities.js # AI personality definitions
│   │   └── ...
│   ├── models/
│   │   ├── Debate.js          # Debate schema (core data model)
│   │   ├── User.js            # User schema
│   │   └── ...
│   ├── routes/
│   │   ├── auth.js            # Authentication endpoints
│   │   ├── debates.js         # Debate CRUD & gameplay endpoints
│   │   └── ...
│   ├── services/
│   │   ├── aiService.js       # OpenAI integration & prompting
│   │   └── ...
│   ├── utils/
│   │   ├── turnValidator.js   # Turn-state validation logic
│   │   ├── autoMatch.js       # Auto-matching job
│   │   ├── debateCleanup.js   # Cleanup job
│   │   └── validateEnv.js     # Environment validation
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication middleware
│   │   ├── rateLimiter.js     # Rate limiting
│   │   └── ...
│   ├── scripts/
│   │   ├── seed.js            # Database seeding
│   │   └── backfillNextTurn.js# Data migration utility
│   ├── server.js              # Main server entry point
│   ├── package.json           # Dependencies
│   └── .env.example           # Environment template
│
├── frontend/                   # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/         # Admin dashboard components
│   │   │   ├── participant/   # Debate room & joining UIs
│   │   │   ├── auth/          # Login & auth flow
│   │   │   └── ...
│   │   ├── context/
│   │   │   ├── AuthContext.jsx    # User state & auth
│   │   │   ├── socketContext.jsx  # Real-time updates
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── api.js         # REST client
│   │   │   └── ...
│   │   ├── config.js          # Frontend config (backend URL, etc.)
│   │   ├── App.jsx            # Main app component & routing
│   │   └── main.jsx           # Entry point
│   ├── tailwind.config.js     # Tailwind styling config
│   ├── vite.config.js         # Vite build config
│   └── package.json           # Dependencies
│
├── fyp-data/                  # Research data & analysis
│   ├── fyp-report/            # Thesis chapters (LaTeX)
│   ├── outputs/               # Analysis results & CSV exports
│   ├── final_analysis.ipynb   # Data analysis notebook
│   └── ...
│
├── docs/                      # Additional documentation
├── README_IMPLEMENTATION_REFERENCE.md  # Technical implementation details
├── WEBSOCKET_COMMUNICATIONS.md         # WebSocket event catalog
└── ONBOARDING.md              # This file!
```

---

## Key Concepts

### 1. **Debate Lifecycle**

A debate moves through these states:

```
waiting → active → survey_pending → completed
                 ↓
            (abandoned - if timeout/error)
```

- **waiting**: Created, waiting for opponent (human-human) or AI assignment
- **active**: Both players present, arguments being submitted
- **survey_pending**: Debate ended, collecting post-debate surveys
- **completed**: All data collected, debate archive
- **abandoned**: Timeout or error occurred

### 2. **Turn Management**

- Debates proceed in **rounds** (default: 10 max)
- Each round alternates between "for" and "against" stances
- `nextTurn` field tracks whose turn it is (`'for'` or `'against'`)
- `turnValidator.js` ensures valid state transitions

### 3. **AI Opponent**

- AI responds with configurable delay (default: 10-30 seconds)
- AI personality determined by debate topic and `aiPersonalities.js`
- Custom system prompts enable different debate styles
- AI response generation handled by `aiService.js` → OpenAI API

### 4. **Real-Time Communication**

- **Socket.IO rooms** organize broadcasts:
  - `'admin'` room: All admin sockets receive platform events
  - `'debate:{debateId}'` room: All participants in debate get updates
- **Key events**: see `WEBSOCKET_COMMUNICATIONS.md`

### 5. **Authentication**

- JWT tokens issued on login/guest signup
- Token stored in localStorage (frontend)
- Token passed in Socket.IO handshake auth
- Stateless: backend validates token signature, no sessions table

---

## Setup Instructions

### Option 1: Docker Compose (Recommended) ⭐

**Fastest path** - handles all services automatically.

```bash
# 1. Create .env with OpenAI key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# 2. Start everything
docker compose up

# 3. Open http://localhost:5173
```

See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed Docker guide.

---

### Option 2: Manual Setup (Local Development)

- Node.js 16+ (check: `node --version`)
- MongoDB (local or Atlas)
- OpenAI API key (for AI opponents)
- Git

### Step-by-Step Setup

#### 1. Clone Repository

```bash
git clone <repository-url>
cd debate-platform
```

#### 2. Backend Setup

```bash
cd backend
npm install

# Create environment file from template
cp .env.example .env.development

# Edit .env.development - populate required variables:
# - MONGODB_URI: MongoDB connection string
# - OPENAI_API_KEY: OpenAI API key
# - JWT_SECRET: Any random secret string (e.g., 'dev-secret-key-change-in-prod')
# - CLIENT_URL: Frontend URL (http://localhost:5173 for local dev)
```

**Environment Variables Reference:**

| Variable         | Purpose                               | Example                               |
| ---------------- | ------------------------------------- | ------------------------------------- |
| `MONGODB_URI`    | MongoDB connection string             | `mongodb://localhost:27017/debate-db` |
| `OPENAI_API_KEY` | OpenAI API key for AI opponents       | `sk-...`                              |
| `JWT_SECRET`     | Secret for signing JWTs               | `dev-secret-change-prod`              |
| `CLIENT_URL`     | Frontend URL for CORS                 | `http://localhost:5173`               |
| `PORT`           | Backend port (optional, default 3000) | `3000`                                |
| `NODE_ENV`       | Environment (development/production)  | `development`                         |

#### 3. Frontend Setup

```bash
cd frontend
npm install

# Edit src/config.js
# Update BACKEND_URL to point to your backend
# Example: http://localhost:3000
```

#### 4. Start Development Servers

**Backend** (Terminal 1):

```bash
cd backend
npm run dev
# Server starts at http://localhost:3000
```

**Frontend** (Terminal 2):

```bash
cd frontend
npm run dev
# App starts at http://localhost:5173
```

#### 5. Seed Initial Data (Optional)

```bash
cd backend
node scripts/seed.js
# Creates test users, debate topics, etc.
```

#### 6. Test Access

- Open http://localhost:5173 in browser
- **Admin login**: Use admin credentials from seeded data
- **Participant**: Create account or use guest mode

---

## Common Development Tasks

### Adding a New Debate Route Endpoint

**File**: `backend/routes/debates.js`

```javascript
// Pattern: POST /api/debates/{debateId}/my-action
router.post("/my-action", authenticate, async (req, res) => {
  try {
    const debate = await Debate.findById(req.params.debateId);
    if (!debate) return res.status(404).json({ error: "Debate not found" });

    // Validate state
    if (debate.status !== "active") {
      return res.status(400).json({ error: "Debate not active" });
    }

    // Perform action
    debate.someField = req.body.value;
    await debate.save();

    // Broadcast to participants (optional)
    io.to(`debate:${debate._id}`).emit("debate:myEvent", {
      debateId: debate._id.toString(),
      data: debate.someField,
    });

    res.json({ success: true, data: debate });
  } catch (error) {
    console.error("[MyAction] Error:", error);
    res.status(500).json({ error: error.message });
  }
});
```

### Adding an AI Personality

**File**: `backend/config/aiPersonalities.js`

```javascript
// Personality schema
const personalities = {
  topicId: {
    stance: "for", // or 'against'
    name: "Persuasive Pro",
    systemPrompt: `You are debating in favor of X. Your style is...`,
  },
};
```

### Adding a Frontend Component

**File**: `frontend/src/components/participant/MyComponent.jsx`

```javascript
import React from "react";
import { useContext } from "react";
import { SocketContext } from "../../context/socketContext";

/**
 * MyComponent - Brief description
 * Manages X functionality
 */
const MyComponent = ({ debateId }) => {
  const socket = useContext(SocketContext);

  React.useEffect(() => {
    // Set up socket listeners
    socket.on("debate:myEvent", (data) => {
      console.log("Received:", data);
    });

    return () => {
      socket.off("debate:myEvent");
    };
  }, [socket]);

  return <div className="p-4">{/* JSX */}</div>;
};

export default MyComponent;
```

### Modifying the Debate Data Model

**File**: `backend/models/Debate.js`

1. Add new field to schema
2. Run data migration if needed (see `scripts/backfillNextTurn.js` for pattern)
3. Update any code using that field
4. Update validation in `utils/turnValidator.js` if state-related
5. Test with `npm run dev`

### Running Database Migrations

```bash
# Example: backfill a new field
cd backend
node scripts/backfillNextTurn.js

# Add your own migration:
# Create new file in scripts/ with migration logic
# Run: node scripts/myMigration.js
```

---

## Debugging & Troubleshooting

### Common Issues & Solutions

#### Issue: "Cannot connect to MongoDB"

**Cause**: MongoDB URI incorrect or MongoDB not running

**Solution**:

```bash
# Check MongoDB is running
mongod --version

# Verify URI in .env.development
# Format: mongodb://[user:password@]host[:port]/database
# Local example: mongodb://localhost:27017/debate-db

# Test connection
node -e "const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log('✓ Connected')).catch(e => console.error('✗', e.message));"
```

#### Issue: "OpenAI API key invalid"

**Cause**: Invalid or missing `OPENAI_API_KEY`

**Solution**:

```bash
# Verify key format starts with 'sk-'
echo $OPENAI_API_KEY

# Regenerate at https://platform.openai.com/api-keys
# Update .env.development
# Restart backend: npm run dev
```

#### Issue: "WebSocket connection failed"

**Cause**: Frontend can't reach backend Socket.IO

**Solution**:

```bash
# Check backend is running on correct port
# Verify BACKEND_URL in frontend/src/config.js matches backend URL
# Check CORS in backend/server.js allows frontend origin
# Check browser console for error messages
```

#### Issue: "JWT token expired"

**Cause**: Token lifespan exceeded

**Solution**:

- Log out and log back in (frontend will get new token)
- Clear localStorage: `localStorage.clear()`
- Refresh page

#### Issue: "Debate gets stuck in 'active' state"

**Cause**: Turn validation failed, AI response didn't complete

**Solution**:

1. Check backend logs for errors
2. Verify AI response generation in `aiService.js`
3. Look at debate document in MongoDB - check `nextTurn` field
4. Use `scripts/backfillNextTurn.js` pattern to manually fix state

### Viewing Logs

**Backend**:

```bash
# Logs printed to console during `npm run dev`
# Look for:
# [Socket] - WebSocket events
# [Auth] - Authentication events
# [AI] - AI service events
# [Error] - Error messages (red)
```

**Frontend**:

```bash
# Browser console (F12 → Console tab)
# Look for Socket.IO connection logs
# Watch for error messages during gameplay
```

**Database**:

```bash
# MongoDB log files (location depends on OS)
# macOS: /usr/local/var/log/mongodb/mongo.log
# Or check mongod output if running in terminal
```

### Enable Debug Logging

**Backend** (in `server.js`):

```javascript
// Add at top of file
const debug = require("debug")("debate:*");
process.env.DEBUG = "debate:*";
```

**Frontend** (in `src/config.js`):

```javascript
// Enable Socket.IO debug
localStorage.debug = "socket.io-client:*";
```

### Useful MongoDB Queries (for debugging)

```javascript
// Connect via MongoDB shell
// See active debates
db.debates.find({ status: "active" }).pretty();

// See debate by ID
db.debates.findOne({ _id: ObjectId("...") });

// Check user accounts
db.users.find().pretty();

// Clear all debates (careful!)
db.debates.deleteMany({});
```

---

## Important Files & Resources

### Technical Documentation

| File                                                                     | Purpose                                 |
| ------------------------------------------------------------------------ | --------------------------------------- |
| [README_IMPLEMENTATION_REFERENCE.md](README_IMPLEMENTATION_REFERENCE.md) | Implementation architecture & internals |
| [WEBSOCKET_COMMUNICATIONS.md](WEBSOCKET_COMMUNICATIONS.md)               | Complete WebSocket event catalog        |
| [backend/models/Debate.js](backend/models/Debate.js)                     | Core data model (well-commented)        |
| [backend/routes/debates.js](backend/routes/debates.js)                   | Debate gameplay endpoints               |
| [backend/services/aiService.js](backend/services/aiService.js)           | AI integration                          |

### Research Documentation

| Location                        | Content                  |
| ------------------------------- | ------------------------ |
| `fyp-data/fyp-report/`          | Full thesis (LaTeX)      |
| `fyp-data/final_analysis.ipynb` | Data analysis & results  |
| `fyp-data/outputs/`             | Processed datasets (CSV) |

### Configuration Files

| File                                | Purpose                    |
| ----------------------------------- | -------------------------- |
| `backend/.env.example`              | Environment template       |
| `backend/config/aiPersonalities.js` | AI personality definitions |
| `frontend/src/config.js`            | Frontend configuration     |
| `frontend/tailwind.config.js`       | Styling configuration      |

---

## Getting Help

### Where to Look First

1. **Frontend issue?** → Check `frontend/src/components/` for similar patterns
2. **Backend issue?** → Check `backend/routes/debates.js` and `backend/models/Debate.js`
3. **Real-time issue?** → See `WEBSOCKET_COMMUNICATIONS.md`
4. **AI issue?** → Check `backend/services/aiService.js` and `backend/config/aiPersonalities.js`
5. **Data issue?** → Review `backend/utils/turnValidator.js`

### Code Style

- Use `const`/`let` (no `var`)
- Comment complex logic with `// EXPLANATION` format
- Use JSDoc for function declarations (see examples below)
- Consistent logging: `console.log('[Module] Message')` pattern

### JSDoc Comment Template

```javascript
/**
 * Brief one-line description of what function does
 * @param {Type} paramName - Description of parameter
 * @returns {Type} Description of return value
 * @throws {Error} When specific error condition occurs
 */
const myFunction = (paramName) => {
  // Implementation
};
```

---

## Next Steps for New Developers

1. ✅ Complete this onboarding guide
2. ✅ Set up local development environment
3. ✅ Run `npm run dev` in both backend and frontend
4. ✅ Create a test account and explore the UI
5. ✅ Read `README_IMPLEMENTATION_REFERENCE.md` for architecture
6. ✅ Read `WEBSOCKET_COMMUNICATIONS.md` for real-time flows
7. ✅ Pick a small bug or feature from the issue tracker
8. ✅ Make your first code change!
9. ✅ Run tests and verify your changes work
10. ✅ Create a pull request with clear description

---

## Questions?

- Check the documentation files listed above
- Search backend logs for error patterns
- Add debug logging to trace execution
- Review similar code patterns in codebase
- Ask experienced team members

**Happy coding! 🚀**
