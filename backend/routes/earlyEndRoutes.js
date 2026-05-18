/**
 * Early End Routes
 * POST /:debateId/vote-end - Vote to end debate early
 * POST /:debateId/revoke-vote - Revoke early end vote
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const earlyEndController = require('../controllers/earlyEndController');

router.post('/:debateId/vote-end', authenticate, earlyEndController.voteToEnd);
router.post('/:debateId/revoke-vote', authenticate, earlyEndController.revokeVote);

module.exports = router;
