/**
 * Argument Routes
 * POST /:debateId/argument - Submit argument during debate
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const argumentController = require('../controllers/argumentController');

router.post('/:debateId/argument', authenticate, argumentController.submitArgument);

module.exports = router;
