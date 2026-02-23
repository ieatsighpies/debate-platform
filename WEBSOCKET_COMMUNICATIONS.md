# WebSocket Communications Summary

## Overview

This document details all real-time WebSocket communications between frontend clients and backend server using Socket.IO.

---

## Client → Server Events (Client Emits)

### Connection Management

#### `join:admin`

- **Sender**: Frontend (Admin Dashboard, Debate Management, Matchmaking Dashboard)
- **Trigger**: Admin user connects/loads dashboard
- **Payload**: None (token passed in handshake auth)
- **Handler**: `server.js` line 98
- **Effect**:
  - Verifies JWT token validity
  - Verifies user role is 'admin'
  - Joins socket to `'admin'` room
  - Logs: `[Socket] Client joined admin room: {socket.id}`

#### `join:debate`

- **Sender**: Frontend (Participant joins/loads debate room)
- **Trigger**: User enters a debate session
- **Payload**: `debateId` (string)
- **Handler**: `server.js` line 121
- **Effect**:
  - Joins socket to `debate:{debateId}` room
  - Logs: `[Socket] Client joined debate room: {debateId}`
  - User can now receive all debate-specific real-time updates

#### `leave:debate`

- **Sender**: Frontend (Participant leaves debate or navigates away)
- **Trigger**: User exits debate room or reaches completion
- **Payload**: `debateId` (string)
- **Handler**: `server.js` line 127
- **Effect**:
  - Removes socket from `debate:{debateId}` room
  - Logs: `[Socket] Client left debate room: {debateId}`

---

## Server → Client Events (Server Broadcasts)

### Debate Lifecycle Events

#### `debate:created`

- **Receiver**: Admin room (`'admin'`)
- **Trigger**: User creates new waiting debate (POST `/api/debates/join`)
- **Source**: `debates.js` line 855
- **Payload**:
  ```javascript
  {
    debateId: ObjectId,
    gameMode: 'human-human' | 'human-ai',
    topicId: Number
  }
  ```
- **Effect**: Admin dashboards see new debate appear in waiting queue

---

#### `debate:started`

- **Receiver**:
  - Debate room: `debate:{debateId}`
  - Admin room: `'admin'`
- **Trigger**:
  - Player2 joins existing debate (human-human) → line 801, 805
  - Admin matches AI opponent (human-ai) → line 970, 974
  - AutoMatch job completes → `autoMatch.js` line 103
- **Payload**:
  ```javascript
  {
    debateId: ObjectId,
    firstPlayer: 'for' | 'against'  // Randomly selected
  }
  ```
- **Effect**:
  - Both participants notified debate is active
  - First player determined and announced
  - UI transitions from waiting to debate view
  - If firstPlayer is AI, AI generates opening argument

---

#### `debate:argumentAdded`

- **Receiver**:
  - Debate room: `debate:{debateId}`
  - Admin room: `'admin'`
- **Trigger**: Either player submits argument via POST `/api/debates/{debateId}/argument`
- **Source**: `debates.js` lines 1099, 1106, 2136, 2143
- **Payload**:
  ```javascript
  {
    debateId: ObjectId,
    argument: {
      stance: 'for' | 'against',
      text: String (max 500 chars),
      round: Number,
      submittedBy: 'human'
    },
    status: 'active',
    currentRound: Number,
    nextTurn: 'for' | 'against'  // Opponent's stance
  }
  ```
- **Effect**:
  - Real-time argument appears for opponent
  - Turn passes to next player
  - Admin sees live argument feed
  - If opponent is AI and it's their turn, AI response auto-triggered after short delay

---

#### `debate:roundAdvanced`

- **Receiver**:
  - Debate room: `debate:{debateId}`
  - Admin room: `'admin'`
- **Trigger**: Both players have submitted their belief updates for current round
- **Source**: `debates.js` lines 367, 373
- **Payload**:
  ```javascript
  {
    debateId: ObjectId,
    currentRound: Number,  // Incremented
    status: 'active' | 'completed',
    nextTurn: 'for' | 'against'
  }
  ```
- **Effect**:
  - Round counter increments
  - If debate reached max rounds, status becomes 'completed'
  - Otherwise, players prepare for next round

---

#### `debate:completed`

- **Receiver**:
  - Debate room: `debate:{debateId}`
  - Admin room: `'admin'`
- **Trigger**:
  - Natural completion (20 rounds finished) → line 381, 1553
  - Early end agreed by both players → line 53, 59
  - Admin force-ended → line 1553
  - AI timeout vote completion → line 53, 59
- **Source**: `debates.js` lines 53, 59, 381, 385, 1553, 1557
- **Payload**:
  ```javascript
  {
    debateId: ObjectId,
    reason: 'Debate completed'
          | 'Both participants agreed to end early'
          | 'Admin ended debate early'
  }
  ```
- **Effect**:
  - UI transitions to post-debate survey screen
  - Results become final and locked
  - Admin sees debate moved to 'completed' list

---

#### `debate:cancelled`

- **Receiver**: All connected sockets
- **Trigger**: Debate creator cancels waiting debate via DELETE `/api/debates/{debateId}/cancel`
- **Source**: `debates.js` line 1769
- **Payload**:
  ```javascript
  {
    debateId: ObjectId;
  }
  ```
- **Effect**:
  - Other waiting players no longer see this debate
  - Admin queue refreshes

---

### Belief Update Events

#### `debate:roundAdvanced` (Implicit Belief Trigger)

- When belief updates are submitted for both players in a round
- Triggers round advancement automatically
- See above for full payload

---

### Early End Voting Events

#### `debate:earlyEndVote`

- **Receiver**:
  - Debate room: `debate:{debateId}`
  - Admin room: `'admin'` (only Debate Management receives via manual fetch)
- **Trigger**:
  - Player votes to end via POST `/api/debates/{debateId}/vote-end` → line 1624
  - Player revokes vote via POST `/api/debates/{debateId}/revoke-vote` → line 1718
  - AI decides to vote (in human-AI mode) → line 449
- **Source**: `debates.js` lines 449, 1624, 1718
- **Payload**:
  ```javascript
  {
    debateId: ObjectId (or string),
    votes: {
      player1Voted: Boolean,
      player2Voted: Boolean
    }
  }
  ```
- **Effect**:
  - Both players see current vote status
  - If both true in human-human mode → debate automatically completes
  - If human votes in human-AI mode → AI handler decides to vote (with delay)

---

### Admin Maintenance Events

#### `debates:cleanup`

- **Receiver**: Admin room (`'admin'`)
- **Trigger**: Cleanup job runs (stale debate detection)
- **Source**: `debateCleanup.js` line 37
- **Payload**:
  ```javascript
  {
    reason: String,  // Cleanup reason
    cleanedCount: Number
  }
  ```
- **Effect**: Admin dashboard refreshes to show cleaned-up debates

---

## Room Structure

### Server-Side Rooms

1. **`admin`** - All connected admins
2. **`debate:{debateId}`** - Participants in specific debate + admin observers

### Broadcasting Patterns

| Event                  | Rooms                  | Recipients                |
| ---------------------- | ---------------------- | ------------------------- |
| `debate:created`       | `'admin'`              | All admins                |
| `debate:started`       | `debate:{id}`, `admin` | Both players + all admins |
| `debate:argumentAdded` | `debate:{id}`, `admin` | Both players + all admins |
| `debate:roundAdvanced` | `debate:{id}`, `admin` | Both players + all admins |
| `debate:completed`     | `debate:{id}`, `admin` | Both players + all admins |
| `debate:cancelled`     | Global `emit()`        | All connected clients     |
| `debate:earlyEndVote`  | `debate:{id}`, `admin` | Both players + all admins |
| `debates:cleanup`      | `'admin'`              | All admins                |

---

## Connection Lifecycle

### On User Login

1. Frontend creates socket with JWT token in handshake auth
2. `connect` event emitted (connection successful)
3. If user is admin: `join:admin` emitted
4. If user joins debate: `join:debate` emitted

### On User Join Debate

1. `join:debate` emitted with debateId
2. Socket joins `debate:{debateId}` room
3. Receives all subsequent debate events for this room

### On Debate Completion

1. `debate:completed` event emitted to room
2. Frontend transitions to post-survey UI
3. Optional: Player leaves room via `leave:debate`

### On User Logout/Disconnect

1. `disconnect` event logged
2. Socket automatically removed from all rooms
3. Frontend removes socket connection

---

## Data Flow Example: Argument Submission

```
1. Player submits argument
   ↓
2. Frontend: POST /api/debates/{id}/argument
   ↓
3. Backend: Route validates, saves argument, emits WebSocket event
   ↓
4. Server broadcasts: debate:argumentAdded
   ↓
5. Both players' UI receives event in real-time
   ↓
6. Turn passes to opponent
   ↓
7. If opponent is AI: Backend scheduled AI response generation
   ↓
8. AI writes argument, server emits another debate:argumentAdded
```

---

## Error Handling

### Socket Connection Errors

- **Event**: `connect_error`
- **Handler**: Frontend catches, logs, shows connection warning
- **Retry**: Automatic reconnection with exponential backoff (5 attempts, max 5s delay)

### Socket Disconnection

- **Event**: `disconnect`
- **Reason**: Network issue, server restart, token expiry
- **Frontend Response**: Attempt reconnect, show offline indicator

---

## Performance Notes

- **Polling Fallback**: WebSocket with polling fallback enabled for compatibility
- **Transports**: Both `'websocket'` and `'polling'` enabled
- **Timeout**: 20s connection timeout
- **Reconnection**: Max 5 attempts with exponential backoff

---

## Security

- **Token-Based Auth**: JWT token required in socket handshake
- **Role Verification**: Admin events only sent to verified admin sockets
- **Room Isolation**: Participants only receive events for debates they're in
- **No Direct Client Messaging**: All events routed through server (no P2P)
