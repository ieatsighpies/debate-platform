/**
 * Survey Controller
 * Handles pre-debate and post-debate survey submissions
 */

const Debate = require('../models/Debate');
const debateService = require('../services/debateService');

/**
 * Submit pre-debate survey
 * POST /api/debates/:debateId/pre-survey
 */
exports.submitPreSurvey = async (req, res) => {
  try {
    const { debateId } = req.params;
    const { response } = req.body;
    const userId = req.user.userId;

    const validResponses = ['firm_on_stance', 'convinced_of_stance', 'open_to_change'];

    if (!response || !validResponses.includes(response)) {
      return res.status(400).json({
        message: 'Invalid response. Must be one of: firm_on_stance, convinced_of_stance, open_to_change'
      });
    }

    const debate = await Debate.findById(debateId);
    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (debate.status !== 'waiting') {
      return res.status(400).json({ message: 'Survey can only be submitted before debate starts' });
    }

    if (isPlayer1) {
      debate.preDebateSurvey.player1 = response;

      const existingPlayer1Round0 = debate.beliefHistory.find(b => b.round === 0 && b.userId?.toString() === userId);
      if (!existingPlayer1Round0) {
        const beliefValue = debateService.calculateRound0BeliefValue(response, debate.player1Stance);
        debate.beliefHistory.push({
          round: 0,
          userId: debate.player1UserId,
          player: 'player1',
          beliefValue,
          influence: 0,
          confidence: 0
        });
        console.log('[Pre-Survey]  Registered Round 0 belief for player1:', {
          beliefValue,
          response,
          stance: debate.player1Stance
        });
      }
    } else if (isPlayer2) {
      debate.preDebateSurvey.player2 = response;

      const existingPlayer2Round0 = debate.beliefHistory.find(b => b.round === 0 && b.userId?.toString() === userId);
      if (!existingPlayer2Round0) {
        const beliefValue = debateService.calculateRound0BeliefValue(response, debate.player2Stance);
        debate.beliefHistory.push({
          round: 0,
          userId: debate.player2UserId,
          player: 'player2',
          beliefValue,
          influence: 0,
          confidence: 0
        });
        console.log('[Pre-Survey]  Registered Round 0 belief for player2:', {
          beliefValue,
          response,
          stance: debate.player2Stance
        });
      }
    }

    await debate.save();

    res.json({
      message: 'Pre-debate survey submitted',
      debate
    });
  } catch (error) {
    console.error('Error submitting pre-debate survey:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Submit post-debate survey
 * POST /api/debates/:debateId/post-survey
 */
exports.submitPostSurvey = async (req, res) => {
  try {
    const { debateId } = req.params;
    const {
      response,
      opponentPerception,
      stanceStrength,
      stanceConfidence,
      perceptionConfidence,
      suspicionTiming,
      detectionCues,
      detectionOther,
      aiAwarenessEffect,
      aiAwarenessJustification,
      humanAwarenessEffect,
      humanAwarenessJustification,
      unsureAwarenessEffect,
      unsureAwarenessJustification
    } = req.body;
    const userId = req.user.userId;

    console.log('[Post-Survey] Submission attempt:', {
      debateId,
      userId,
      response,
      stanceStrength,
      stanceConfidence,
      opponentPerception,
      perceptionConfidence,
      suspicionTiming,
      detectionCuesCount: detectionCues?.length
    });

    const validResponses = [
      'strengthened',
      'slightly_strengthened',
      'no_effect',
      'slightly_weakened',
      'weakened'
    ];
    const validPerceptions = ['human', 'ai', 'unsure'];
    const validTimings = ['round_1_2', 'round_3_4', 'round_5_7', 'round_8_12', 'round_13_17', 'round_18_20', 'never_suspected'];
    const validAwarenessEffects = ['no_difference', 'less_persuasive', 'more_persuasive', 'not_sure'];

    if (!response || !validResponses.includes(response)) {
      console.log('Invalid post-survey response:', response);
      return res.status(400).json({
        message: `Invalid response. Must be one of: ${validResponses.join(', ')}`
      });
    }

    if (!stanceStrength || stanceStrength < 1 || stanceStrength > 7) {
      return res.status(400).json({
        message: 'Invalid stance strength. Must be between 1 and 7'
      });
    }

    if (!stanceConfidence || stanceConfidence < 1 || stanceConfidence > 7) {
      return res.status(400).json({
        message: 'Invalid stance confidence. Must be between 1 and 7'
      });
    }

    if (opponentPerception && !validPerceptions.includes(opponentPerception)) {
      return res.status(400).json({
        message: 'Invalid opponent perception. Must be one of: human, ai, unsure'
      });
    }

    if (!perceptionConfidence || perceptionConfidence < 1 || perceptionConfidence > 5) {
      return res.status(400).json({
        message: 'Invalid confidence level. Must be between 1 and 5'
      });
    }

    if (!suspicionTiming || !validTimings.includes(suspicionTiming)) {
      return res.status(400).json({
        message: 'Invalid suspicion timing'
      });
    }

    if (!detectionCues || !Array.isArray(detectionCues) || detectionCues.length === 0) {
      return res.status(400).json({
        message: 'Please select at least one detection cue'
      });
    }

    if (opponentPerception === 'ai') {
      if (!aiAwarenessEffect || !validAwarenessEffects.includes(aiAwarenessEffect)) {
        return res.status(400).json({
          message: 'Invalid AI awareness effect'
        });
      }
    } else if (opponentPerception === 'human') {
      if (!humanAwarenessEffect || !validAwarenessEffects.includes(humanAwarenessEffect)) {
        return res.status(400).json({
          message: 'Invalid human awareness effect'
        });
      }
    } else if (opponentPerception === 'unsure') {
      if (!unsureAwarenessEffect || !validAwarenessEffects.includes(unsureAwarenessEffect)) {
        return res.status(400).json({
          message: 'Invalid unsure awareness effect'
        });
      }
    }

    const debate = await Debate.findById(debateId);
    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    if (!['survey_pending', 'completed'].includes(debate.status)) {
      return res.status(400).json({
        message: 'Debate must be in survey_pending or completed status'
      });
    }

    const postSurveyKey = isPlayer1 ? 'player1' : 'player2';
    const existingResponse = debate.postDebateSurvey && debate.postDebateSurvey[postSurveyKey];

    if (existingResponse) {
      return res.status(400).json({
        message: 'Post-debate survey already submitted for this player'
      });
    }

    if (!debate.postDebateSurvey) {
      debate.postDebateSurvey = {};
    }

    debate.postDebateSurvey[postSurveyKey] = {
      response,
      opponentPerception,
      stanceStrength,
      stanceConfidence,
      perceptionConfidence,
      suspicionTiming,
      detectionCues,
      detectionOther: detectionOther || null,
      aiAwarenessEffect: aiAwarenessEffect || null,
      aiAwarenessJustification: aiAwarenessJustification || null,
      humanAwarenessEffect: humanAwarenessEffect || null,
      humanAwarenessJustification: humanAwarenessJustification || null,
      unsureAwarenessEffect: unsureAwarenessEffect || null,
      unsureAwarenessJustification: unsureAwarenessJustification || null,
      submittedAt: new Date()
    };

    await debate.save();

    console.log('[Post-Survey] Submitted:', {
      debateId,
      player: postSurveyKey,
      response,
      opponentPerception
    });

    res.json({
      message: 'Post-debate survey submitted successfully',
      debate
    });
  } catch (error) {
    console.error('[Post-Survey] Error submitting post-debate survey:', error);
    res.status(500).json({
      message: 'Failed to submit post-debate survey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
