/**
 * Early End Controller
 * Handles early termination voting and related logic
 */

const Debate = require('../models/Debate');
const debateService = require('../services/debateService');

/**
 * Vote to end debate early
 * POST /api/debates/:debateId/vote-end
 */
exports.voteToEnd = async (req, res) => {
  try {
    const userId = req.user.userId;
    const debate = await Debate.findById(req.params.debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    if (debate.status !== 'active') {
      return res.status(400).json({ message: 'Debate is not active' });
    }

    if (debate.currentRound < 5) {
      return res.status(400).json({ message: 'Must complete at least 5 rounds before ending early' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    const voteField = isPlayer1 ? 'player1Voted' : 'player2Voted';
    const timestampField = isPlayer1 ? 'player1Timestamp' : 'player2Timestamp';

    if (debate.earlyEndVotes[voteField]) {
      return res.status(400).json({ message: 'You have already voted' });
    }

    debate.earlyEndVotes[voteField] = true;
    debate.earlyEndVotes[timestampField] = new Date();

    await debate.save();

    console.log('[EarlyEnd] Vote recorded:', {
      debateId: debate._id,
      voter: isPlayer1 ? 'player1' : 'player2',
      gameMode: debate.gameMode
    });

    const io = req.app.get('io');

    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:earlyEndVote', {
        debateId: debate._id.toString(),
        votes: {
          player1Voted: debate.earlyEndVotes.player1Voted || false,
          player2Voted: debate.earlyEndVotes.player2Voted || false
        }
      });
    }

    if (debate.gameMode === 'human-human') {
      const player1Voted = debate.earlyEndVotes.player1Voted || false;
      const player2Voted = debate.earlyEndVotes.player2Voted || false;

      if (player1Voted && player2Voted) {
        console.log('[EarlyEnd] Both players voted - ending debate');
        await debateService.completeDebateEarly(debate._id, 'mutual_consent', io);

        return res.json({
          message: 'Both players agreed - debate ending',
          votesComplete: true
        });
      }
    }

    if (debate.gameMode === 'human-ai') {
      console.log('[EarlyEnd] Human voted in AI mode - triggering AI handler');
      handleAIEarlyEndVote(debate, io);
    }

    res.json({
      message: 'Vote recorded',
      votes: {
        player1Voted: debate.earlyEndVotes.player1Voted || false,
        player2Voted: debate.earlyEndVotes.player2Voted || false
      }
    });
  } catch (error) {
    console.error('[EarlyEnd] Error voting:', error);
    res.status(500).json({ message: 'Failed to record vote' });
  }
};

/**
 * Revoke early end vote
 * POST /api/debates/:debateId/revoke-vote
 */
exports.revokeVote = async (req, res) => {
  try {
    const userId = req.user.userId;
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

    const voteField = isPlayer1 ? 'player1Voted' : 'player2Voted';
    const timestampField = isPlayer1 ? 'player1Timestamp' : 'player2Timestamp';

    if (!debate.earlyEndVotes[voteField]) {
      return res.status(400).json({ message: 'You have not voted yet' });
    }

    debate.earlyEndVotes[voteField] = false;
    debate.earlyEndVotes[timestampField] = null;

    if (debate.gameMode === 'human-ai') {
      debate.earlyEndVotes.humanVoted = false;
    }

    await debate.save();

    console.log('[EarlyEnd] Vote revoked:', {
      debateId: debate._id,
      voter: isPlayer1 ? 'player1' : 'player2'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:earlyEndVote', {
        debateId: debate._id.toString(),
        votes: {
          player1Voted: debate.earlyEndVotes.player1Voted,
          player2Voted: debate.earlyEndVotes.player2Voted,
          yourVote: isPlayer1 ? debate.earlyEndVotes.player1Voted : debate.earlyEndVotes.player2Voted
        }
      });
    }

    res.json({
      message: 'Vote revoked',
      votes: {
        player1Voted: debate.earlyEndVotes.player1Voted,
        player2Voted: debate.earlyEndVotes.player2Voted
      }
    });
  } catch (error) {
    console.error('[EarlyEnd] Error revoking vote:', error);
    res.status(500).json({ message: 'Failed to revoke vote' });
  }
};

/**
 * AI handling for early end votes (internal helper)
 */
async function handleAIEarlyEndVote(debate, io) {
  try {
    console.log('[AI EarlyEnd] Human voted, calculating AI response...');

    const strategy = calculateAIVoteStrategy(debate);

    console.log('[AI EarlyEnd] Strategy calculated:', {
      shouldAgree: strategy.shouldAgree,
      confidence: strategy.confidence,
      factors: strategy.factors
    });

    if (strategy.shouldAgree) {
      const isPlayer1AI = debate.player1Type === 'ai';
      const aiVoteField = isPlayer1AI ? 'player1Voted' : 'player2Voted';
      const aiTimestampField = isPlayer1AI ? 'player1Timestamp' : 'player2Timestamp';

      const thinkingDelay = 1000 + Math.random() * 2000;

      const timeoutId = setTimeout(async () => {
        try {
          const { unregisterAIVoteTimeout } = require('../services/aiDebateService');
          unregisterAIVoteTimeout(debate._id.toString());

          const freshDebate = await Debate.findById(debate._id);

          if (!freshDebate || freshDebate.status !== 'active') {
            console.log('[AI EarlyEnd] Debate no longer active, aborting');
            return;
          }

          freshDebate.earlyEndVotes[aiVoteField] = true;
          freshDebate.earlyEndVotes[aiTimestampField] = new Date();
          await freshDebate.save();

          console.log('[AI EarlyEnd]  AI voted to end debate');

          if (io) {
            io.to(`debate:${freshDebate._id}`).emit('debate:earlyEndVote', {
              debateId: freshDebate._id.toString(),
              votes: {
                player1Voted: freshDebate.earlyEndVotes.player1Voted || false,
                player2Voted: freshDebate.earlyEndVotes.player2Voted || false
              }
            });
          }

          const player1Voted = freshDebate.earlyEndVotes.player1Voted || false;
          const player2Voted = freshDebate.earlyEndVotes.player2Voted || false;

          if (player1Voted && player2Voted) {
            console.log('[AI EarlyEnd] Both voted - ending debate');
            await debateService.completeDebateEarly(freshDebate._id, 'mutual_consent', io);
          }
        } catch (error) {
          console.error('[AI EarlyEnd] ❌ Error in timeout handler:', error);
        }
      }, thinkingDelay);

      // Register timeout for cleanup on server shutdown
      const { registerAIVoteTimeout } = require('../services/aiDebateService');
      registerAIVoteTimeout(debate._id.toString(), timeoutId);
    } else {
      console.log('[AI EarlyEnd] AI decided not to vote (strategy.shouldAgree = false)');
    }
  } catch (error) {
    console.error('[AI EarlyEnd] ❌ Error handling AI vote:', error);
  }
}

/**
 * Calculate AI voting strategy for early end
 */
function calculateAIVoteStrategy(debate) {
  const factors = {
    currentRound: debate.currentRound,
    maxRounds: debate.maxRounds,
    roundsRemaining: debate.maxRounds - debate.currentRound,
    argumentCount: debate.arguments.length,
    debateLength: debate.arguments.reduce((sum, arg) => sum + arg.text.length, 0)
  };

  let agreeScore = 0;

  if (factors.currentRound >= 5) {
    agreeScore += 90;
  }

  return {
    shouldAgree: agreeScore >= 50,
    confidence: Math.min(100, Math.max(0, agreeScore)) / 100,
    factors
  };
}

module.exports = exports;
