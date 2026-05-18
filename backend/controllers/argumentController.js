/**
 * Argument Controller
 * Handles argument submission during debate rounds
 */

const Debate = require('../models/Debate');
const turnValidator = require('../utils/turnValidator');
const debateService = require('../services/debateService');

/**
 * Submit an argument during a debate round
 * POST /api/debates/:debateId/argument
 */
exports.submitArgument = async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.user.userId;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: 'Argument text is required' });
    }

    if (text.trim().length > 500) {
      return res.status(400).json({ message: 'Argument too long (max 500 characters)' });
    }

    const debate = await Debate.findById(req.params.debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    if (debate.status !== 'active') {
      return res.status(400).json({ message: 'Debate is not active' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    const userStance = isPlayer1 ? debate.player1Stance : debate.player2Stance;

    const currentRoundArgs = debate.arguments.filter(arg => arg.round === debate.currentRound);
    if (currentRoundArgs.length >= 2) {
      return res.status(400).json({ message: 'Round is already complete' });
    }

    const expectedNextTurn = debateService.getExpectedNextTurn(debate);
    if (debate.nextTurn !== expectedNextTurn) {
      console.error('[Turn] Mismatch detected on submit', {
        debateId: debate._id,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn,
        expectedNextTurn
      });
      return res.status(409).json({ message: 'Turn state mismatch. Please refresh and try again.' });
    }

    if (!debate.nextTurn) {
      return res.status(409).json({ message: 'Turn state missing. Round may be awaiting belief check.' });
    }

    if (debate.nextTurn !== userStance) {
      return res.status(400).json({ message: 'Not your turn' });
    }

    debate.arguments.push({
      stance: userStance,
      text: text.trim(),
      round: debate.currentRound,
      submittedBy: 'human'
    });

    const newRoundArgs = debate.arguments.filter(arg => arg.round === debate.currentRound);
    if (newRoundArgs.length === 1) {
      debate.nextTurn = debateService.getOppositeStance(userStance);
    } else if (newRoundArgs.length === 2) {
      debate.nextTurn = null;
      if (debate.player2Type === 'ai') {
        await debateService.recordAIBeliefUpdate(debate, debate.currentRound);
      }
    } else {
      throw new Error('Round has more than two arguments');
    }

    await debate.save();

    const validation = turnValidator.validateTurnState(debate);
    if (!validation.isValid) {
      console.warn('[Debate] Turn state validation failed after argument submission:', {
        debateId: debate._id,
        errors: validation.errors
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:argumentAdded', {
        debateId: debate._id.toString(),
        argument: debate.arguments[debate.arguments.length - 1],
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
      io.to('admin').emit('debate:argumentAdded', {
        debateId: debate._id.toString(),
        argument: debate.arguments[debate.arguments.length - 1],
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
    }

    // Trigger AI response immediately after human argument
    if (debate.player2Type === 'ai' && debate.status === 'active' && debate.aiEnabled && debate.nextTurn === debate.player2Stance) {
      const debateId = debate._id;
      console.log('[AI] Scheduling AI response for debate:', debateId);

      setImmediate(async () => {
        try {
          const currentIO = req.app.get('io');
          const { triggerAIResponse } = require('../services/aiDebateService');
          await triggerAIResponse(debateId, currentIO);
        } catch (error) {
          console.error('[AI] Error in scheduled response:', error);
        }
      });
    }

    res.json({ debate });
  } catch (error) {
    console.error('[Debate] Error submitting argument:', error);
    res.status(500).json({ message: 'Failed to submit argument' });
  }
};

module.exports = exports;
