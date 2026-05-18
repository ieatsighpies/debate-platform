# Debate Platform - API Reference

Complete documentation of all REST endpoints and WebSocket events.

## Table of Contents

1. [REST API](#rest-api)
   - [Authentication](#authentication)
   - [Debates](#debates)
2. [WebSocket Events](#websocket-events)
3. [Error Handling](#error-handling)
4. [Response Examples](#response-examples)

---

## REST API

**Base URL**: `http://localhost:3000/api`

**Authentication**: Most endpoints require JWT token in `Authorization: Bearer <token>` header

### Authentication

#### POST `/auth/login`

Log in with username and password.

**Request:**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGc...",
  "user": {
    "_id": "ObjectId",
    "username": "john_doe",
    "role": "participant",
    "isGuest": false,
    "createdAt": "2024-05-18T...",
    "updatedAt": "2024-05-18T..."
  }
}
```

**Errors:**

- `401 Unauthorized` - Invalid credentials
- `400 Bad Request` - Missing username or password

---

#### POST `/auth/signup`

Create a new user account.

**Request:**

```json
{
  "username": "string",
  "password": "string"
}
```

**Response (201 Created):**

```json
{
  "token": "eyJhbGc...",
  "user": {
    "_id": "ObjectId",
    "username": "jane_doe",
    "role": "participant",
    "isGuest": false,
    "createdAt": "2024-05-18T..."
  }
}
```

**Errors:**

- `409 Conflict` - Username already exists
- `400 Bad Request` - Invalid input

---

#### POST `/auth/guest`

Create anonymous guest session.

**Request:** No body required

**Response (201 Created):**

```json
{
  "token": "eyJhbGc...",
  "user": {
    "_id": "ObjectId",
    "username": "guest_a1b2c3",
    "role": "participant",
    "isGuest": true,
    "createdAt": "2024-05-18T..."
  }
}
```

---

#### POST `/auth/resume-guest`

Resume a previous guest session.

**Request:**

```json
{
  "token": "eyJhbGc..."
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "user": {
    /* user object */
  }
}
```

---

#### GET `/auth/me`

Get current authenticated user's profile.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```json
{
  "_id": "ObjectId",
  "username": "john_doe",
  "role": "participant",
  "isGuest": false,
  "createdAt": "2024-05-18T..."
}
```

---

### Debates

#### GET `/debates`

List all debates (filtered by query parameters).

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `waiting`, `active`, `survey_pending`, `completed`, `abandoned` |
| `gameMode` | string | Filter by `human-human` or `human-ai` |
| `userId` | ObjectId | Filter debates with specific user |
| `limit` | number | Max results (default: 20) |
| `skip` | number | Pagination offset (default: 0) |

**Response (200 OK):**

```json
{
  "debates": [
    {
      "_id": "ObjectId",
      "topicId": 1,
      "topicQuestion": "Should artificial intelligence be regulated?",
      "gameMode": "human-human",
      "status": "active",
      "player1UserId": "ObjectId",
      "player1Stance": "for",
      "player2UserId": "ObjectId",
      "player2Stance": "against",
      "currentRound": 2,
      "maxRounds": 10,
      "firstPlayer": "for",
      "nextTurn": "against",
      "createdAt": "2024-05-18T...",
      "updatedAt": "2024-05-18T..."
    }
  ],
  "total": 45,
  "limit": 20,
  "skip": 0
}
```

---

#### POST `/debates/join`

Create a new debate or join existing waiting debate.

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "topicId": "number",
  "gameMode": "human-human | human-ai",
  "stance": "for | against | random"
}
```

**Response (201 Created / 200 OK):**

```json
{
  "debateId": "ObjectId",
  "status": "waiting | active",
  "gameMode": "human-human | human-ai",
  "yourStance": "for",
  "topicQuestion": "Should artificial intelligence be regulated?",
  "firstPlayer": "for (if active)",
  "nextTurn": "for (if active)"
}
```

**Errors:**

- `400 Bad Request` - Invalid topicId or gameMode
- `404 Not Found` - Topic not found

---

#### GET `/debates/:debateId`

Get detailed debate information.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```json
{
  "_id": "ObjectId",
  "topicId": 1,
  "topicQuestion": "Should artificial intelligence be regulated?",
  "gameMode": "human-ai",
  "status": "active",

  "player1UserId": "ObjectId",
  "player1Stance": "for",
  "player1StanceChoice": "for",

  "player2Type": "ai",
  "player2AIModel": "balanced-debater",
  "player2Stance": "against",

  "currentRound": 2,
  "maxRounds": 10,
  "firstPlayer": "for",
  "nextTurn": "against",

  "arguments": [
    {
      "_id": "ObjectId",
      "stance": "for",
      "round": 1,
      "text": "AI regulation is crucial because...",
      "createdAt": "2024-05-18T..."
    }
  ],

  "currentBelief": {
    "player1": "for",
    "player2": "for"
  },
  "currentBeliefValue": {
    "player1": 65,
    "player2": 45
  },

  "preDebateSurvey": {
    "player1": { "stance": "for", "confidence": 7 },
    "player2": { "stance": "against", "confidence": 6 }
  },

  "postDebateSurvey": {
    "player1": null,
    "player2": null
  },

  "createdAt": "2024-05-18T...",
  "startedAt": "2024-05-18T...",
  "completedAt": null
}
```

---

#### POST `/debates/:debateId/argument`

Submit an argument in the debate.

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "text": "string (250-4000 characters)"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "argument": {
    "_id": "ObjectId",
    "stance": "for",
    "round": 2,
    "text": "AI regulation is crucial because...",
    "createdAt": "2024-05-18T..."
  },
  "debate": {
    "currentRound": 2,
    "nextTurn": "against",
    "status": "active"
  }
}
```

**Errors:**

- `400 Bad Request` - Argument too short/long, not player's turn, invalid debate state
- `403 Forbidden` - User not participant in debate
- `404 Not Found` - Debate not found

---

#### POST `/debates/:debateId/belief`

Submit belief/stance change after both players have argued.

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "newBelief": "for | against | unsure",
  "beliefValue": 0-100,
  "reason": "string (optional)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "currentRound": 2,
  "belief": "for",
  "beliefValue": 65,
  "nextRound": 3,
  "nextTurn": "for",
  "roundsRemaining": 8
}
```

**Errors:**

- `400 Bad Request` - Invalid belief value, both players haven't argued yet
- `403 Forbidden` - User not participant
- `404 Not Found` - Debate not found

---

#### POST `/debates/:debateId/pre-survey`

Submit pre-debate survey (before debate starts).

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "stance": "for | against | unsure",
  "confidence": 1-10,
  "reasoning": "string (optional)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "preDebateSurvey": {
    "stance": "for",
    "confidence": 7,
    "reasoning": "..."
  }
}
```

---

#### POST `/debates/:debateId/post-survey`

Submit post-debate survey (after debate ends).

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "stance": "for | against | unsure",
  "confidence": 1-10,
  "persuaded": true | false,
  "persuasiveness": 1-10,
  "reasoning": "string (optional)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "postDebateSurvey": {
    "stance": "for",
    "confidence": 8,
    "persuaded": true,
    "persuasiveness": 7,
    "reasoning": "..."
  }
}
```

---

#### POST `/debates/:debateId/early-end-vote`

Vote to end debate early (mutual consent required).

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "vote": true | false
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "votes": {
    "player1": true,
    "player2": false
  },
  "debateStatus": "active | survey_pending"
}
```

**Notes:**

- If both players vote true, debate transitions to survey collection
- If any player votes false, vote is reset

---

#### POST `/debates/:debateId/admin/next-turn` (Admin Only)

Force advance turn (debugging/admin override).

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "nextTurn": "for | against"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "nextTurn": "against"
}
```

---

#### POST `/debates/:debateId/admin/ai-response` (Admin Only)

Manually trigger AI response (debugging).

**Headers:**

```
Authorization: Bearer <token>
```

**Request:**

```json
{
  "customPrompt": "string (optional)"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "aiArgument": "AI response text...",
  "round": 2,
  "nextTurn": "for"
}
```

---

## WebSocket Events

**Connection**: Requires JWT in handshake query or auth property

**Rooms**:

- `admin` - All admin sockets
- `debate:{debateId}` - All participants in debate

### Client → Server

#### `join:admin`

Join admin broadcast room (admin only).

**Emit:**

```javascript
socket.emit("join:admin");
```

**Server Response:** Logs join to admin room

---

#### `join:debate`

Join debate-specific room.

**Emit:**

```javascript
socket.emit("join:debate", {
  debateId: "ObjectId",
});
```

**Server Response:** Joins socket to `debate:{debateId}` room

---

#### `leave:debate`

Leave debate room.

**Emit:**

```javascript
socket.emit("leave:debate", {
  debateId: "ObjectId",
});
```

---

### Server → Client

#### `debate:created`

New debate created (broadcast to admin).

**Receives:**

```javascript
{
  debateId: 'ObjectId',
  gameMode: 'human-human' | 'human-ai',
  topicId: 1
}
```

---

#### `debate:started`

Debate started (both players present or AI assigned).

**Receives:**

```javascript
{
  debateId: 'ObjectId',
  firstPlayer: 'for' | 'against'
}
```

---

#### `debate:argumentAdded`

New argument submitted.

**Receives:**

```javascript
{
  debateId: 'ObjectId',
  stance: 'for' | 'against',
  round: 2,
  argument: 'Argument text...',
  nextTurn: 'against'
}
```

---

#### `debate:roundAdvanced`

Round progressed (both players have argued).

**Receives:**

```javascript
{
  debateId: 'ObjectId',
  newRound: 3,
  nextTurn: 'for'
}
```

---

#### `debate:completed`

Debate ended.

**Receives:**

```javascript
{
  debateId: 'ObjectId',
  reason: 'Max rounds reached' | 'Mutual consent' | 'Timeout' | 'Error'
}
```

---

#### `debate:cancelled`

Debate cancelled.

**Receives:**

```javascript
{
  debateId: 'ObjectId',
  reason: 'string'
}
```

---

#### `debates:cleanup`

Admin broadcast: stale debates removed.

**Receives:**

```javascript
{
  count: 5,
  reason: 'Cleanup job'
}
```

---

## Error Handling

### Standard Error Response

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "status": 400,
  "details": {
    /* optional additional info */
  }
}
```

### Common HTTP Status Codes

| Code | Meaning              | Common Cause                                       |
| ---- | -------------------- | -------------------------------------------------- |
| 200  | OK                   | Request succeeded                                  |
| 201  | Created              | Resource created successfully                      |
| 400  | Bad Request          | Invalid input or request body                      |
| 401  | Unauthorized         | Missing or invalid token                           |
| 403  | Forbidden            | User lacks permission                              |
| 404  | Not Found            | Resource doesn't exist                             |
| 409  | Conflict             | Resource already exists (e.g., duplicate username) |
| 422  | Unprocessable Entity | Validation failed                                  |
| 429  | Too Many Requests    | Rate limit exceeded                                |
| 500  | Server Error         | Unexpected server error                            |

### Rate Limiting

- **Limit**: 100 requests per 15 minutes per IP
- **Header**: `X-RateLimit-Remaining` shows requests left
- **Response**: 429 status when exceeded

---

## Response Examples

### Debate State Machine

```
waiting
  ↓ (second player joins OR AI auto-matched)
active
  ↓ (all rounds complete OR mutual early end vote)
survey_pending
  ↓ (surveys collected)
completed

(abandoned - any error or critical timeout)
```

### Full Debate Lifecycle Example

```javascript
// 1. Create/join debate
POST /api/debates/join
{
  "topicId": 1,
  "gameMode": "human-ai",
  "stance": "random"
}
// Response: debate in "waiting" status

// 2. WebSocket: join debate room
socket.emit('join:debate', { debateId: '...' })

// 3. WebSocket: receive debate start
// debate:started event fires, status → "active"

// 4. Submit pre-survey
POST /api/debates/:debateId/pre-survey
{ "stance": "for", "confidence": 7 }

// 5. Wait for AI to start OR join as second player

// 6. Submit argument (your turn)
POST /api/debates/:debateId/argument
{ "text": "Argument text..." }

// 7. WebSocket: receive argument from opponent
// debate:argumentAdded event

// 8. Submit belief change
POST /api/debates/:debateId/belief
{ "newBelief": "for", "beliefValue": 65 }

// 9. WebSocket: receive round advance
// debate:roundAdvanced event

// 10. Repeat steps 6-9 for up to 10 rounds

// 11. WebSocket: receive debate completion
// debate:completed event

// 12. Submit post-survey
POST /api/debates/:debateId/post-survey
{ "stance": "for", "confidence": 8, "persuaded": true, ... }

// Debate now in "completed" status ✓
```

---

## Admin-Only Endpoints

The following endpoints require `user.role === 'admin'`:

- `GET /api/debates?status=...` - Can see all debates
- `POST /api/debates/:debateId/admin/next-turn`
- `POST /api/debates/:debateId/admin/ai-response`
- WebSocket `join:admin` - Receive all platform broadcasts

---

## Testing the API

### Using cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"john_doe","password":"password123"}'

# Get token from response
TOKEN="eyJhbGc..."

# Create debate
curl -X POST http://localhost:3000/api/debates/join \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topicId":1,"gameMode":"human-ai","stance":"random"}'
```

### Using Postman

1. Import endpoint collection (see `API_REFERENCE.json` if available)
2. Set `BASE_URL` environment variable to `http://localhost:3000/api`
3. Set `TOKEN` after login
4. Requests use `{{BASE_URL}}/...` and `Authorization: Bearer {{TOKEN}}`

---

## Debugging Tips

- Check backend logs for request handling
- Use browser DevTools Network tab to inspect requests/responses
- Test with Postman or cURL before integrating into frontend
- Verify JWT token in `Authorization` header is not expired
- Check WebSocket connection status in browser console
