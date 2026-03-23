# Implementation Reference (Engineering Details)

This document contains implementation-level architecture details that were intentionally removed from the thesis chapter to keep the report focused on research validity and data collection logic.

Use this file as the technical companion to the thesis section in `fyp-data/fyp-report/system_design_architecture.tex`.

## Scope of This Reference

Included here:

- Full real-time event catalog and room-level communication details
- Connection lifecycle and transport fallback configuration
- Guest session/login-resume operational behavior
- Turn-state validation internals and recovery helpers
- Scalability and resilience implementation notes
- Operational safeguards for data quality

Not included here:

- Statistical interpretation and empirical findings (see thesis chapters)

## Platform Stack Snapshot

- Frontend: React 18.2 + Vite
- Backend: Node.js + Express + Socket.IO
- Database: MongoDB (Mongoose models)
- AI service: OpenAI GPT-4o mini personalities
- Authentication: JWT-based stateless auth

## WebSocket Event Catalog

### Client to Server

- `join:admin`
- `join:debate`
- `leave:debate`

### Server to Client

- `debate:created`
- `debate:started`
- `debate:argumentAdded`
- `debate:roundAdvanced`
- `debate:completed`
- `debate:cancelled`
- `debate:earlyEndVote`
- `debates:cleanup`

### Connection Events

- `connect`
- `disconnect`
- `reconnect`
- `connect_error`

### Room Model

- `admin`: all admin sockets for monitoring broadcasts
- `debate:{id}`: participants and observers for debate-specific events
- Global broadcast used for cancellation notifications

## Real-Time Flow (Implementation View)

Typical argument loop:

1. Frontend submits argument to REST endpoint.
2. Backend validates turn state and payload constraints.
3. Backend writes argument to MongoDB.
4. Backend emits `debate:argumentAdded` to debate and admin rooms.
5. If opponent is AI, backend schedules and emits AI response after configured delay.
6. After both sides complete a round, backend advances round state and emits `debate:roundAdvanced`.
7. End-of-debate conditions emit `debate:completed` and transition clients to post-survey.

## Connection Lifecycle and Transport

- Socket initialized with JWT in handshake auth
- Participant joins room on debate entry and leaves on navigation/logout
- Preferred transport: `websocket`
- Fallback transport: `polling`
- Automatic reconnection with backoff on transient network failures
- Legacy compatibility mode enabled where required by client transport stack

## Guest Login and Resume (Operational)

- Guest accounts are auto-generated on guest login
- Guest records are persisted with `isGuest=true`
- Guest JWTs use longer expiry than regular sessions
- Resume endpoint allows recovery of recent guest sessions
- Cleanup jobs remove stale guest records according to retention policy

## Turn-State Validation and Recovery Internals

Key helpers and safeguards (implementation layer):

- `calculateExpectedNextTurn(debate)` computes expected next-turn state from round/stance context
- `autoFixTurnState(debate)` repairs inconsistent `nextTurn` values in-memory before save
- `logTurnStateReport(debate)` writes diagnostics for mismatch audits
- `saveWithValidation(debate, context)` wraps persistence with post-save validation logs

Validation integration points:

- Debate model pre-save middleware
- AI response generation path
- Argument submission path
- Automatch AI assignment path

Recovery strategy:

- Detect invalid turn state early
- Auto-correct when safe
- Log all repairs for post-mortem debugging
- Continue processing unless critical integrity failure occurs

## Scalability Notes

- Stateless API servers support horizontal load balancing
- Real-time layer may require sticky sessions or shared message infrastructure at scale
- Database replication and indexing support read-heavy workloads
- Background cleanup workers prevent buildup of stale debate/session records

## Error Handling and Resilience

### API Layer

- Standardized error response structures
- HTTP status code classification
- Validation-first request handling

### Network Layer

- Reconnect behavior for interrupted sockets
- Transport fallback for environments blocking WebSocket
- Graceful degradation during transient outages

### Persistence Layer

- Database reconnect behavior and retry strategy
- Safe write paths for debate lifecycle transitions
- Validation logging for anomaly triage

## Data Quality Safeguards (Operational)

- Turn-gated progression to prevent out-of-order capture
- Required between-round updates before advancement
- Timestamped belief/reflection writes for sequence reconstruction
- Admin monitoring broadcasts for active debate oversight
- Rate limiting and auth checks to reduce malformed or adversarial traffic

## Codebase Pointers

For implementation source, see:

- `backend/server.js`
- `backend/routes/debates.js`
- `backend/routes/auth.js`
- `backend/models/Debate.js`
- `backend/middleware/auth.js`
- `backend/middleware/rateLimiter.js`
- `backend/utils/turnValidator.js`
- `backend/services/aiService.js`
- `frontend/src/context/socketContext.jsx`

## Versioning Guidance

For reproducible citation in academic writing, reference a fixed commit hash or release tag in addition to the repository URL.
