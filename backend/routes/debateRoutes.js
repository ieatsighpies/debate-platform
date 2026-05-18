/**
 * Core Debate Routes
 * GET /topics, GET /all-debates, GET /my-status, POST /join,
 * DELETE /:debateId/cancel, GET /:debateId/analytics
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const debateController = require('../controllers/debateController');

// Static routes (no parameters)
router.get('/topics', debateController.getTopics);
router.get('/all-debates', authenticate, debateController.getAllDebates);
router.get('/my-status', authenticate, debateController.getMyStatus);

// AI personalities
router.get('/ai-personalities', authenticate, debateController.getAIPersonalities);
router.get('/ai-personalities/:modelId', authenticate, debateController.getAIPersonalityDetails);

// Join debate
router.post('/join', authenticate, debateController.joinDebate);

// Analytics
router.get('/:debateId/analytics', authenticate, debateController.getAnalytics);

// Cancel waiting debate
router.delete('/:debateId/cancel', authenticate, debateController.cancelDebate);

// Match with AI
router.post('/:debateId/match-ai', authenticate, debateController.matchWithAI);

module.exports = router;
