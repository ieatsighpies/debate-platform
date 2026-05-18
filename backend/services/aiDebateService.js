/**
 * AI Debate Service
 * Handles AI response generation and AI-related debate logic
 */

const Debate = require('../models/Debate');
const aiService = require('./aiService');
const turnValidator = require('../utils/turnValidator');
const debateService = require('./debateService');

const aiPersonalities = require('../config/aiPersonalities');

// ============================================
// GLOBAL TIMEOUT TRACKING (for cleanup on shutdown)
// ============================================
const aiVoteTimeouts = new Map();

/**
 * Register a timeout for later cleanup
 */
function registerAIVoteTimeout(debateId, timeoutId) {
  aiVoteTimeouts.set(debateId, timeoutId);
}

/**
 * Unregister a timeout when it completes
 */
function unregisterAIVoteTimeout(debateId) {
  aiVoteTimeouts.delete(debateId);
}

/**
 * Clean up all pending AI vote timeouts (called on server shutdown)
 */
function cleanupAllAITimeouts() {
  const count = aiVoteTimeouts.size;

  if (count === 0) {
    console.log('[AI EarlyEnd] No pending timeouts to clean up');
    return 0;
  }

  console.log('[AI EarlyEnd] Cleaning up', count, 'pending AI vote timeouts...');

  aiVoteTimeouts.forEach((timeoutId, debateId) => {
    clearTimeout(timeoutId);
    console.log('[AI EarlyEnd]   ↳ Cleared timeout for debate:', debateId);
  });

  aiVoteTimeouts.clear();

  console.log('[AI EarlyEnd]  All timeouts cleaned up successfully');

  return count;
}

/**
 * Trigger AI response for a debate
 * Generates AI argument, applies delay, saves to database, and emits via Socket.IO
 */
async function triggerAIResponse(debateId, io) {
  try {
    const debate = await Debate.findById(debateId);

    if (!debate) {
      throw new Error('Debate not found');
    }

    // Validate turn state - auto-fix if needed
    const validation = turnValidator.validateTurnState(debate);
    if (!validation.isValid) {
      console.warn('[AI] Turn state validation failed:', {
        debateId: debate._id,
        errors: validation.errors
      });

      const fixed = turnValidator.autoFixTurnState(debate);
      if (fixed) {
        await debate.save();
        console.log('[AI] Turn state was auto-fixed');
      }
    }

    if (debate.player2Type !== 'ai') {
      throw new Error('Debate does not have AI opponent');
    }

    if (debate.status !== 'active') {
      throw new Error('Debate is not active');
    }

    if (!debate.aiEnabled) {
      console.log('[AI] AI is paused for this debate');
      return;
    }

    const expectedNextTurn = debateService.getExpectedNextTurn(debate);
    if (debate.nextTurn !== expectedNextTurn) {
      throw new Error(`Turn state mismatch: nextTurn=${debate.nextTurn} expected=${expectedNextTurn}`);
    }

    if (!expectedNextTurn) {
      throw new Error('Round complete; awaiting belief check');
    }

    if (debate.nextTurn !== debate.player2Stance) {
      throw new Error(`Not AI's turn: nextTurn=${debate.nextTurn}`);
    }

    console.log('[AI] Generating AI argument...');

    const aiArgument = await aiService.generateArgument(debate);
    const personality = aiPersonalities[debate.player2AIModel];
    const configuredDelayMs = debate.aiResponseDelay ? debate.aiResponseDelay * 1000 : 0;
    const delay = calculateAIResponseDelay(aiArgument.length, debate, personality) || configuredDelayMs || 2000;

    console.log(`[AI] Argument generated (${aiArgument.length} chars). Waiting ${(delay/1000).toFixed(1)}s before sending...`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    debate.arguments.push({
      stance: debate.player2Stance,
      text: aiArgument,
      round: debate.currentRound,
      submittedBy: 'ai'
    });
    debate.aiLastResponseAt = new Date();

    const newRoundArgs = debate.arguments.filter(arg => arg.round === debate.currentRound);
    if (newRoundArgs.length === 1) {
      debate.nextTurn = debateService.getOppositeStance(debate.player2Stance);
    } else if (newRoundArgs.length === 2) {
      debate.nextTurn = null;
      await debateService.recordAIBeliefUpdate(debate, debate.currentRound);
    } else {
      throw new Error('Round has more than two arguments');
    }

    await debate.save();

    const aiValidation = turnValidator.validateTurnState(debate);
    if (!aiValidation.isValid) {
      console.warn('[AI] Turn state validation failed after AI response:', {
        debateId: debate._id,
        errors: aiValidation.errors
      });
    }

    const latestArgument = debate.arguments[debate.arguments.length - 1];
    console.log('[AI]  AI argument submitted');

    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:argumentAdded', {
        debateId: debate._id.toString(),
        argument: latestArgument,
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
      io.to('admin').emit('debate:argumentAdded', {
        debateId: debate._id.toString(),
        argument: latestArgument,
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
    }
  } catch (error) {
    console.error('[AI] Error generating response:', error);
    throw error;
  }
}

/**
 * Calculate realistic response delay based on argument length and debate context
 */
function calculateAIResponseDelay(argumentLength, debate, personality) {
  const round = debate.currentRound;

  // Base typing speed: 40-70 chars per second (realistic human range)
  const baseTypingSpeed = 20 + Math.random() * 30;

  // Calculate typing time based on argument length
  const typingTime = (argumentLength / baseTypingSpeed) * 1000; // milliseconds

  // Add "thinking time" before typing (varies by round)
  let thinkingTime;

  if (round <= 3) {
    // Early rounds: more thinking (4-8 seconds)
    thinkingTime = 4000 + Math.random() * 5000;
  } else if (round <= 10) {
    // Middle rounds: less thinking (2-5 seconds)
    thinkingTime = 2000 + Math.random() * 5000;
  } else {
    // Late rounds: variable (quick or slow due to fatigue)
    thinkingTime = Math.random() > 0.6
      ? 500 + Math.random() * 2000    // Quick: 0.5-2.5s
      : 2000 + Math.random() * 6000;  // Slow: 2-8s
  }

  // Add random "typing pauses" (0-2 pauses)
  const numPauses = Math.floor(Math.random() * 3);
  let pauseTime = 0;
  for (let i = 0; i < numPauses; i++) {
    pauseTime += 800 + Math.random() * 2200; // 0.8-3 second pauses each
  }

  // Total delay
  let totalDelay = thinkingTime + typingTime + pauseTime;

  // Apply personality modifier
  if (personality.personality === 'firm_on_stance') {
    totalDelay *= 0.95; // Firm debaters respond faster
  } else if (personality.personality === 'open_to_change') {
    totalDelay *= 1.15; // Open debaters take longer
  }

  // Random "distraction" spike (10% chance)
  if (Math.random() < 0.1) {
    totalDelay += 5000 + Math.random() * 10000; // +5-15 seconds
  }

  // Enforce bounds
  const minDelay = 5000;  // 5 seconds minimum
  const maxDelay = 35000; // 35 seconds maximum
  totalDelay = Math.max(minDelay, Math.min(maxDelay, totalDelay));

  return Math.floor(totalDelay);
}

module.exports = {
  triggerAIResponse,
  calculateAIResponseDelay,
  registerAIVoteTimeout,
  unregisterAIVoteTimeout,
  cleanupAllAITimeouts
};
