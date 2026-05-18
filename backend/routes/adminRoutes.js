/**
 * Admin Routes
 * POST /:debateId/trigger-ai - Manually trigger AI response (admin only)
 * PUT /:debateId/end-early - End debate early (admin only)
 * PUT /:debateId/ai-control - Pause/resume AI (admin only)
 * PUT /:debateId/first-player - Set first player preference (admin only)
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const debateController = require('../controllers/debateController');
const adminController = require('../controllers/adminController');

router.post('/:debateId/trigger-ai', authenticate, adminController.triggerAI);
router.put('/:debateId/end-early', authenticate, adminController.endDebateEarly);
router.put('/:debateId/ai-control', authenticate, debateController.setAIControl);
router.put('/:debateId/first-player', authenticate, debateController.setFirstPlayerPreference);

module.exports = router;
