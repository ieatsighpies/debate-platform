/**
 * Debate Service
 * Business logic and helper functions for debate operations
 * Extracted from routes/debates.js for better maintainability
 */

const Debate = require('../models/Debate');
const aiService = require('./aiService');

/**
 * Determine which player goes first in a debate
 * @param {Object} debate - The debate document
 * @returns {string} 'for' or 'against'
 */
function determineFirstPlayer(debate) {
  if (debate.firstPlayerPreference && debate.firstPlayerPreference !== 'random') {
    return debate.firstPlayerPreference;
  }
  return Math.random() < 0.5 ? 'for' : 'against';
}

/**
 * Calculate belief value from pre-survey response
 * @param {string} preSurveyResponse - Survey response: 'firm_on_stance', 'convinced_of_stance', 'open_to_change'
 * @param {string} stance - 'for' or 'against'
 * @returns {number} Belief value (0-100)
 */
function calculateRound0BeliefValue(preSurveyResponse, stance) {
  if (preSurveyResponse === 'firm_on_stance') {
    return stance === 'for' ? 100 : 0;
  } else if (preSurveyResponse === 'convinced_of_stance') {
    return stance === 'for' ? 75 : 25;
  } else if (preSurveyResponse === 'open_to_change') {
    return 50;
  }
  return 50;
}

/**
 * Initialize Round 0 belief entries when debate becomes active
 */
async function initializeRound0Beliefs(debate, user1Id, user2Id) {
  try {
    console.log('[Round0] Initializing Round 0 belief values for debate:', debate._id);

    const existingPlayer1Round0 = debate.beliefHistory.find(b => b.player === 'player1');
    if (!existingPlayer1Round0) {
      const player1Belief = {
        round: 0,
        userId: user1Id,
        player: 'player1',
        beliefValue: calculateRound0BeliefValue(debate.preDebateSurvey.player1, debate.player1Stance),
        influence: 0,
        confidence: 0
      };
      debate.beliefHistory.push(player1Belief);
      console.log('[Round0] Created Round 0 belief for player1:', player1Belief.beliefValue);
    }

    const existingPlayer2Round0 = debate.beliefHistory.find(b => b.player === 'player2');
    if (!existingPlayer2Round0 && debate.player2Stance) {
      const player2Belief = {
        round: 0,
        userId: user2Id || null,
        player: 'player2',
        beliefValue: calculateRound0BeliefValue(debate.preDebateSurvey.player2, debate.player2Stance),
        influence: 0,
        confidence: 0
      };
      debate.beliefHistory.push(player2Belief);
      console.log('[Round0] Created Round 0 belief for player2:', player2Belief.beliefValue);
    }

    await debate.save();
  } catch (error) {
    console.error('[Round0] ❌ Error initializing Round 0 beliefs:', error);
    throw error;
  }
}

/**
 * Map categorical belief to numeric value
 */
function mapBeliefCategoryToNumeric(category) {
  if (category === 'for') return 100;
  if (category === 'against') return 0;
  return 50; // unsure
}

/**
 * Map numeric belief value to category
 */
function mapBeliefValueToCategory(value) {
  if (typeof value !== 'number') return 'unsure';
  if (value <= 33) return 'against';
  if (value <= 66) return 'unsure';
  return 'for';
}

/**
 * Get opposite stance
 */
function getOppositeStance(stance) {
  return stance === 'for' ? 'against' : 'for';
}

/**
 * Calculate expected next turn based on current argument count
 */
function getExpectedNextTurn(debate) {
  const currentRoundArgs = (debate.arguments || []).filter(arg => arg.round === debate.currentRound);

  if (currentRoundArgs.length === 0) {
    return debate.firstPlayer;
  }

  if (currentRoundArgs.length === 1) {
    return getOppositeStance(currentRoundArgs[0].stance);
  }

  return null;
}

/**
 * Check if belief entry exists for a round and player
 */
function hasBeliefEntryForRound(debate, roundNumber, playerKey) {
  return (debate.beliefHistory || []).some(entry =>
    entry.round === roundNumber && entry.player === playerKey
  );
}

/**
 * Check if reflection entry exists for a round and player
 */
function hasReflectionEntryForRound(debate, roundNumber, playerKey) {
  if (!debate || !roundNumber || !playerKey) return false;

  const hasPlayerTaggedEntry = (debate.reflections || []).some(entry =>
    entry.round === roundNumber && entry.player === playerKey
  );
  if (hasPlayerTaggedEntry) return true;

  const targetUserId = playerKey === 'player1' ? debate.player1UserId : debate.player2UserId;
  if (!targetUserId) return false;

  return (debate.reflections || []).some(entry =>
    entry.round === roundNumber && entry.userId && entry.userId.toString() === targetUserId.toString()
  );
}

/**
 * Record AI belief update after completing arguments
 */
async function recordAIBeliefUpdate(debate, roundNumber) {
  if (!debate || debate.player2Type !== 'ai') return false;

  const existing = (debate.beliefHistory || []).some(entry =>
    entry.round === roundNumber && entry.player === 'player2'
  );
  if (existing) {
    console.log('[AI Belief] Skip - already recorded', {
      debateId: debate._id,
      round: roundNumber
    });
    return false;
  }

  let beliefNumeric = null;
  let influence = 0;
  let confidence = null;

  const aiBelief = await aiService.generateBeliefUpdate(debate, roundNumber);
  if (aiBelief) {
    beliefNumeric = aiBelief.beliefValue;
    influence = aiBelief.influence;
    confidence = aiBelief.confidence;
  }

  if (beliefNumeric === null) {
    const beliefCategoryFallback =
      (debate.currentBelief && debate.currentBelief.player2) ||
      debate.player2StanceChoice ||
      debate.player2Stance ||
      'unsure';

    beliefNumeric =
      (debate.currentBeliefValue && typeof debate.currentBeliefValue.player2 === 'number')
        ? debate.currentBeliefValue.player2
        : mapBeliefCategoryToNumeric(beliefCategoryFallback);
  }

  const beliefCategory = mapBeliefValueToCategory(beliefNumeric);

  debate.beliefHistory = debate.beliefHistory || [];
  debate.beliefHistory.push({
    round: roundNumber,
    userId: null,
    player: 'player2',
    belief: beliefCategory,
    beliefValue: beliefNumeric,
    influence,
    confidence,
    skipped: false
  });

  debate.currentBelief = debate.currentBelief || {};
  debate.currentBeliefValue = debate.currentBeliefValue || {};
  debate.currentBelief.player2 = beliefCategory;
  debate.currentBeliefValue.player2 = beliefNumeric;

  console.log('[AI Belief] Recorded', {
    debateId: debate._id,
    round: roundNumber,
    belief: beliefCategory,
    beliefValue: beliefNumeric,
    influence,
    confidence
  });

  return true;
}

/**
 * Generate AI post-survey response
 */
async function generateAIPostSurvey(debate) {
  if (debate.player2Type !== 'ai' || !debate.preDebateSurvey.player2) {
    return null;
  }

  try {
    console.log('[AI PostSurvey] Generating response for debate:', debate._id);
    const response = await aiService.generatePostSurveyResponse(debate);
    return response;
  } catch (error) {
    console.error('[AI PostSurvey] Error generating response:', error);
    const mapping = {
      'firm_on_stance': 'still_firm',
      'convinced_of_stance': 'opponent_made_points',
      'open_to_change': 'opponent_made_points'
    };
    return mapping[debate.preDebateSurvey.player2] || 'opponent_made_points';
  }
}

/**
 * Complete debate early with optional AI post-survey
 */
async function completeDebateEarly(debateId, reason, io) {
  try {
    const debate = await Debate.findById(debateId);

    if (!debate) {
      throw new Error('Debate not found');
    }

    if (debate.player2Type === 'ai' && debate.preDebateSurvey.player2) {
      console.log('[EarlyEnd] Generating AI post-survey response...');
      const aiResponse = await generateAIPostSurvey(debate);
      debate.postDebateSurvey.player2 = aiResponse;
      console.log('[EarlyEnd] AI post-survey:', aiResponse);
    }

    debate.status = 'survey_pending';
    debate.completedAt = new Date();
    debate.completionReason = reason;
    debate.earlyEndVotes.expired = true;
    debate.nextTurn = null;

    await debate.save();

    console.log('[EarlyEnd]  Debate completed early:', {
      debateId,
      reason,
      round: debate.currentRound,
      maxRounds: debate.maxRounds,
      argumentCount: debate.arguments.length
    });

    if (io) {
      io.to(`debate:${debateId}`).emit('debate:completed', {
        debateId: debateId.toString(),
        reason: reason === 'mutual_consent' || reason === 'mutual_consent_ai'
          ? 'Both participants agreed to end early'
          : 'Debate completed'
      });
      io.to('admin').emit('debate:completed', {
        debateId: debateId.toString(),
        reason: reason === 'mutual_consent' || reason === 'mutual_consent_ai'
          ? 'Both participants agreed to end early'
          : 'Debate completed'
      });
    }

    return debate;
  } catch (error) {
    console.error('[EarlyEnd] ❌ Error completing debate:', error);
    throw error;
  }
}

/**
 * Advance round after beliefs collected from both players
 */
async function maybeAdvanceRoundAfterBeliefs(debate, io) {
  if (!debate || debate.status !== 'active') return false;

  const roundNumber = debate.currentRound;
  const roundArgs = (debate.arguments || []).filter(arg => arg.round === roundNumber);
  if (roundArgs.length < 2) return false;

  const requirePlayer2 = debate.player2Type === 'human' || debate.player2Type === 'ai';
  const player1Done = hasBeliefEntryForRound(debate, roundNumber, 'player1');
  const player2Done = requirePlayer2 ? hasBeliefEntryForRound(debate, roundNumber, 'player2') : true;

  if (!player1Done || !player2Done) return false;

  const requirePlayer2Reflection = debate.player2Type === 'human';
  const player1ReflectionDone = hasReflectionEntryForRound(debate, roundNumber, 'player1');
  const player2ReflectionDone = requirePlayer2Reflection
    ? hasReflectionEntryForRound(debate, roundNumber, 'player2')
    : true;

  if (!player1ReflectionDone || !player2ReflectionDone) return false;

  if (debate.currentRound >= debate.maxRounds) {
    if (debate.player2Type === 'ai' && debate.preDebateSurvey.player2) {
      console.log('[Debate] Generating AI post-survey response (belief-gated completion)...');
      const aiResponse = await generateAIPostSurvey(debate);
      debate.postDebateSurvey.player2 = aiResponse;
    }

    debate.status = 'survey_pending';
    debate.completedAt = new Date();
    debate.completionReason = 'natural_completion';
    debate.earlyEndVotes.expired = true;
    debate.nextTurn = null;
  } else {
    if (!debate.firstPlayer) {
      throw new Error('Cannot advance round without firstPlayer set');
    }
    debate.currentRound += 1;
    debate.nextTurn = debate.firstPlayer;
  }

  await debate.save();

  if (io) {
    io.to(`debate:${debate._id}`).emit('debate:roundAdvanced', {
      debateId: debate._id.toString(),
      currentRound: debate.currentRound,
      status: debate.status,
      nextTurn: debate.nextTurn
    });
    io.to('admin').emit('debate:roundAdvanced', {
      debateId: debate._id.toString(),
      currentRound: debate.currentRound,
      status: debate.status,
      nextTurn: debate.nextTurn
    });

    if (debate.status === 'survey_pending') {
      io.to(`debate:${debate._id}`).emit('debate:completed', {
        debateId: debate._id.toString(),
        reason: 'Debate completed'
      });
      io.to('admin').emit('debate:completed', {
        debateId: debate._id.toString(),
        reason: 'Debate completed'
      });
    }
  }

  if (debate.status === 'active' && debate.player2Type === 'ai' && debate.aiEnabled && debate.nextTurn === debate.player2Stance) {
    setImmediate(async () => {
      try {
        const { triggerAIResponse } = require('./aiDebateService');
        await triggerAIResponse(debate._id, io);
      } catch (error) {
        console.error('[AI] Error triggering response after round advance:', error);
      }
    });
  }

  return true;
}

module.exports = {
  determineFirstPlayer,
  calculateRound0BeliefValue,
  initializeRound0Beliefs,
  mapBeliefCategoryToNumeric,
  mapBeliefValueToCategory,
  getOppositeStance,
  getExpectedNextTurn,
  hasBeliefEntryForRound,
  hasReflectionEntryForRound,
  recordAIBeliefUpdate,
  generateAIPostSurvey,
  completeDebateEarly,
  maybeAdvanceRoundAfterBeliefs
};
