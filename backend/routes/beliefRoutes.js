/**
 * Belief Routes
 * POST /:debateId/belief-update - Submit belief after round
 * POST /:debateId/belief-skip - Skip belief (disabled)
 * POST /:debateId/reflection - Submit reflection/paraphrase
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const beliefController = require('../controllers/beliefController');

router.post('/:debateId/belief-update', authenticate, beliefController.submitBeliefUpdate);
router.post('/:debateId/belief-skip', authenticate, beliefController.skipBeliefUpdate);
router.post('/:debateId/reflection', authenticate, beliefController.submitReflection);

module.exports = router;
