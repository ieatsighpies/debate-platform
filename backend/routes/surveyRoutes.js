/**
 * Survey Routes
 * POST /:debateId/pre-survey - Submit pre-debate survey
 * POST /:debateId/post-survey - Submit post-debate survey
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const surveyController = require('../controllers/surveyController');

router.post('/:debateId/pre-survey', authenticate, surveyController.submitPreSurvey);
router.post('/:debateId/post-survey', authenticate, surveyController.submitPostSurvey);

module.exports = router;
