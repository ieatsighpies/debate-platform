const express = require('express');
const router = express.Router();
const Debate = require('../models/Debate');
const authenticate = require('../middleware/auth');
const aiService = require('../services/aiService');
const turnValidator = require('../utils/turnValidator');

// ============================================
// HELPER: DETERMINE FIRST PLAYER
// ============================================
const determineFirstPlayer = (debate) => {
  // If admin has set a preference, use it (unless it's 'random')
  if (debate.firstPlayerPreference && debate.firstPlayerPreference !== 'random') {
    return debate.firstPlayerPreference;
  }
  // Otherwise, random selection
  return Math.random() < 0.5 ? 'for' : 'against';
};

// ============================================
// GLOBAL TIMEOUT TRACKING
// ============================================
const aiVoteTimeouts = new Map();

// ============================================
// COMPLETE DEBATE EARLY
// ============================================
const completeDebateEarly = async (debateId, reason, io) => {
  try {
    const debate = await Debate.findById(debateId);

    if (!debate) {
      throw new Error('Debate not found');
    }

    // GENERATE AI POST-SURVEY RESPONSE
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

    cleanupAITimeout(debateId);

    console.log('[EarlyEnd]  Debate completed early:', {
      debateId,
      reason,
      round: debate.currentRound,
      maxRounds: debate.maxRounds,
      argumentCount: debate.arguments.length,
      aiPostSurvey: debate.postDebateSurvey.player2
    });

    // Emit completion event
    if (io) {
      io.to(`debate:${debateId}`).emit('debate:completed', {
        debateId,
        reason: reason === 'mutual_consent' || reason === 'mutual_consent_ai'
          ? 'Both participants agreed to end early'
          : 'Debate completed'
      });
      io.to('admin').emit('debate:completed', {
        debateId,
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
};


// Helper: Generate AI post-survey response
const generateAIPostSurvey = async (debate) => {
  if (debate.player2Type !== 'ai' || !debate.preDebateSurvey.player2) {
    return null;
  }

  try {
    console.log('[AI PostSurvey] Generating response for debate:', debate._id);
    const response = await aiService.generatePostSurveyResponse(debate);
    return response;
  } catch (error) {
    console.error('[AI PostSurvey] Error generating response:', error);
    // Fallback mapping
    const mapping = {
      'firm_on_stance': 'still_firm',
      'convinced_of_stance': 'opponent_made_points',
      'open_to_change': 'opponent_made_points'
    };
    return mapping[debate.preDebateSurvey.player2] || 'opponent_made_points';
  }
};

// Helper: Calculate Round 0 belief value from pre-survey response and stance
const calculateRound0BeliefValue = (preSurveyResponse, stance) => {
  // preSurveyResponse: 'firm_on_stance', 'convinced_of_stance', 'open_to_change'
  // stance: 'for' or 'against'

  if (preSurveyResponse === 'firm_on_stance') {
    return stance === 'for' ? 100 : 0;
  } else if (preSurveyResponse === 'convinced_of_stance') {
    return stance === 'for' ? 75 : 25;
  } else if (preSurveyResponse === 'open_to_change') {
    return 50;
  }

  // Default fallback
  return 50;
};

// Helper: Initialize Round 0 belief entries when debate becomes active
const initializeRound0Beliefs = async (debate, user1Id, user2Id) => {
  try {
    console.log('[Round0] Initializing Round 0 belief values for debate:', debate._id);

    // Player1 belief - only create if doesn't exist
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
    } else {
      console.log('[Round0] Player1 Round 0 belief already exists, skipping');
    }

    // Player2 belief - only create if doesn't exist AND player2 has been assigned
    const existingPlayer2Round0 = debate.beliefHistory.find(b => b.player === 'player2');
    if (!existingPlayer2Round0 && debate.player2Stance) {
      const player2Belief = {
        round: 0,
        userId: user2Id || null, // null for AI players
        player: 'player2',
        beliefValue: calculateRound0BeliefValue(debate.preDebateSurvey.player2, debate.player2Stance),
        influence: 0,
        confidence: 0
      };
      debate.beliefHistory.push(player2Belief);
      console.log('[Round0] Created Round 0 belief for player2:', player2Belief.beliefValue);
    } else if (existingPlayer2Round0) {
      console.log('[Round0] Player2 Round 0 belief already exists, skipping');
    } else {
      console.log('[Round0] Player2 not yet assigned, skipping belief creation');
    }

    await debate.save();

    console.log('[Round0]  Initialized Round 0 beliefs');
  } catch (error) {
    console.error('[Round0] ❌ Error initializing Round 0 beliefs:', error);
    throw error;
  }
};

// ============================================
// CLEANUP SINGLE AI TIMEOUT
// ============================================
const cleanupAITimeout = (debateId) => {
  const timeoutId = aiVoteTimeouts.get(debateId.toString());

  if (timeoutId) {
    clearTimeout(timeoutId);
    aiVoteTimeouts.delete(debateId.toString());
    console.log('[AI EarlyEnd] Timeout cleaned up for debate:', debateId);
    return true;
  }

  return false;
};

// ============================================
// CLEANUP ALL AI TIMEOUTS (Server Shutdown)
// ============================================
const cleanupAllAITimeouts = () => {
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
};

// ============================================
// CALCULATE AI VOTE STRATEGY
// ============================================
const calculateAIVoteStrategy = (debate) => {
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
};

// ============================================
// CALCULATE AI THINKING DELAY
// ============================================
const aiPersonalities = require('../config/aiPersonalities');
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

const mapBeliefCategoryToNumeric = (category) => {
  if (category === 'for') return 100;
  if (category === 'against') return 0;
  if (category === 'unsure') return 50;
  return 50;
};

const mapBeliefValueToCategory = (value) => {
  if (typeof value !== 'number') return 'unsure';
  if (value <= 33) return 'against';
  if (value <= 66) return 'unsure';
  return 'for';
};

const getOppositeStance = (stance) => (stance === 'for' ? 'against' : 'for');

const getExpectedNextTurn = (debate) => {
  const currentRoundArgs = (debate.arguments || []).filter(arg => arg.round === debate.currentRound);

  if (currentRoundArgs.length === 0) {
    return debate.firstPlayer;
  }

  if (currentRoundArgs.length === 1) {
    return getOppositeStance(currentRoundArgs[0].stance);
  }

  return null;
};

const recordAIBeliefUpdate = async (debate, roundNumber) => {
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
};

const hasBeliefEntryForRound = (debate, roundNumber, playerKey) => {
  return (debate.beliefHistory || []).some(entry =>
    entry.round === roundNumber && entry.player === playerKey
  );
};

const maybeAdvanceRoundAfterBeliefs = async (debate, io) => {
  if (!debate || debate.status !== 'active') return false;

  const roundNumber = debate.currentRound;
  const roundArgs = (debate.arguments || []).filter(arg => arg.round === roundNumber);
  if (roundArgs.length < 2) return false;

  const requirePlayer2 = debate.player2Type === 'human' || debate.player2Type === 'ai';
  const player1Done = hasBeliefEntryForRound(debate, roundNumber, 'player1');
  const player2Done = requirePlayer2 ? hasBeliefEntryForRound(debate, roundNumber, 'player2') : true;

  if (!player1Done || !player2Done) return false;

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
    cleanupAITimeout(debate._id);
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
      debateId: debate._id,
      currentRound: debate.currentRound,
      status: debate.status,
      nextTurn: debate.nextTurn
    });
    io.to('admin').emit('debate:roundAdvanced', {
      debateId: debate._id,
      currentRound: debate.currentRound,
      status: debate.status,
      nextTurn: debate.nextTurn
    });

    if (debate.status === 'completed') {
      io.to(`debate:${debate._id}`).emit('debate:completed', {
        debateId: debate._id,
        reason: 'Debate completed'
      });
      io.to('admin').emit('debate:completed', {
        debateId: debate._id,
        reason: 'Debate completed'
      });
    }
  }

  if (debate.status === 'active' && debate.player2Type === 'ai' && debate.aiEnabled && debate.nextTurn === debate.player2Stance) {
    setImmediate(async () => {
      try {
        await triggerAIResponse(debate._id, io);
      } catch (error) {
        console.error('[AI] Error triggering response after round advance:', error);
      }
    });
  }

  return true;
};

// ============================================
// HANDLE AI EARLY END VOTE
// ============================================
const handleAIEarlyEndVote = async (debate, io) => {
  try {
    console.log('[AI EarlyEnd] Human voted, calculating AI response...');

    //  Calculate AI strategy
    const strategy = calculateAIVoteStrategy(debate);

    console.log('[AI EarlyEnd] Strategy calculated:', {
      shouldAgree: strategy.shouldAgree,
      confidence: strategy.confidence,
      factors: strategy.factors
    });

    if (strategy.shouldAgree) {
      //  Determine which player is AI
      const isPlayer1AI = debate.player1Type === 'ai';
      const aiVoteField = isPlayer1AI ? 'player1Voted' : 'player2Voted';
      const aiTimestampField = isPlayer1AI ? 'player1Timestamp' : 'player2Timestamp';

      // Add delay to simulate thinking (1-3 seconds)
      const thinkingDelay = 1000 + Math.random() * 2000;

      setTimeout(async () => {
        try {
          // Reload debate to ensure fresh data
          const freshDebate = await Debate.findById(debate._id);

          if (!freshDebate || freshDebate.status !== 'active') {
            console.log('[AI EarlyEnd] Debate no longer active, aborting');
            return;
          }

          // Record AI vote
          freshDebate.earlyEndVotes[aiVoteField] = true;
          freshDebate.earlyEndVotes[aiTimestampField] = new Date();
          await freshDebate.save();

          console.log('[AI EarlyEnd]  AI voted to end debate');

          // Emit update to all clients
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
            await completeDebateEarly(freshDebate._id, 'mutual_consent', io);
          }

        } catch (error) {
          console.error('[AI EarlyEnd] ❌ Error in timeout handler:', error);
        }
      }, thinkingDelay);

    } else {
      console.log('[AI EarlyEnd] AI decided not to vote (strategy.shouldAgree = false)');
    }

  } catch (error) {
    console.error('[AI EarlyEnd] ❌ Error handling AI vote:', error);
  }
};

// Debate topics
const topics = [
  { id: 1, question: "Should we use ChatGPT for homework?" },
  { id: 2, question: "Does pineapple belong on pizza?" },
  { id: 3, question: "Go for higher pay at expense of social life (For) or take lower pay to enjoy life (Against)?" }
];

// ============================================
// STATIC ROUTES FIRST (NO PARAMETERS)
// ============================================

// Get topics
router.get('/topics', (req, res) => {
  res.json({ topics });
});

// Get all debates (Admin only)
router.get('/all-debates', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const debates = await Debate.find()
      .populate('player1UserId', 'username')
      .populate('player2UserId', 'username')
      .sort({ createdAt: -1 })
      .limit(100);

    const grouped = {
      waiting: debates.filter(d => d.status === 'waiting'),
      active: debates.filter(d => d.status === 'active'),
      completed: debates.filter(d => d.status === 'completed'),
      abandoned: debates.filter(d => d.status === 'abandoned')
    };

    console.log('[Debate] Grouped:', {
      waiting: grouped.waiting.length,
      active: grouped.active.length,
      completed: grouped.completed.length,
      abandoned: grouped.abandoned.length
    });

    res.json({ debates: grouped });
  } catch (error) {
    console.error('[Debate] Error fetching debates:', error);
    res.status(500).json({ message: 'Failed to fetch debates',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
     });
  }
});


// Check if user has active/waiting debate
router.get('/my-status', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check for debates that still need action - don't include 'completed' debates
    // survey_pending means awaiting survey submission and should block new debates
    const existingDebate = await Debate.findOne({
      $or: [
        { player1UserId: userId },
        { player2UserId: userId }
      ],
      status: { $in: ['waiting', 'active', 'survey_pending'] }
    })
    .populate('player1UserId', 'username')
    .populate('player2UserId', 'username');

    if (existingDebate) {
      const isPlayer1 = existingDebate.player1UserId._id.toString() === userId;
      const yourStance = isPlayer1 ? existingDebate.player1Stance : existingDebate.player2Stance;

      return res.json({
        hasDebate: true,
        debate: {
          _id: existingDebate._id,
          topicQuestion: existingDebate.topicQuestion,
          status: existingDebate.status,
          yourStance,
          currentRound: existingDebate.currentRound,
          maxRounds: existingDebate.maxRounds,
          gameMode: existingDebate.gameMode,
          isPlayer1
        }
      });
    }

    res.json({ hasDebate: false });
  } catch (error) {
    console.error('[Debate] Error checking status:', error);
    res.status(500).json({ message: 'Failed to check debate status' });
  }
});

// Get AI personalities
router.get('/ai-personalities', authenticate, async (req, res) => {
  try {
    console.log('[Debate] Fetching AI personalities for:', req.user.username);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const personalities = aiService.getAvailablePersonalities();
    console.log('[Debate] Returning', personalities.length, 'AI personalities');

    res.json({ personalities });
  } catch (error) {
    console.error('[Debate] Error fetching AI personalities:', error);
    res.status(500).json({
      message: 'Failed to fetch AI personalities',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Join or create debate
router.post('/join', authenticate, async (req, res) => {
  try {
    const { gameMode, topicId, stance, preDebateSurvey } = req.body; // ADD preDebateSurvey
    const userId = req.user.userId;

    // Role check
    if (req.user.role !== 'participant') {
      console.log('[Debate] ❌ Non-participant tried to join:', req.user.username, 'Role:', req.user.role);
      return res.status(403).json({
        message: 'Only participants can join debates. Admins should use the matchmaking dashboard.'
      });
    }

    console.log('[Debate] Join request:', {
      user: req.user.username,
      role: req.user.role,
      gameMode,
      topicId,
      stance,
      preSurvey: preDebateSurvey?.player1 // Log survey response
    });

    // Validation
    if (!gameMode || !topicId || !stance) {
      return res.status(400).json({ message: 'Missing required fields: gameMode, topicId, stance' });
    }

    // VALIDATE PRE-SURVEY
    const validResponses = ['firm_on_stance', 'convinced_of_stance', 'open_to_change'];
    if (!preDebateSurvey?.player1 || !validResponses.includes(preDebateSurvey.player1)) {
      return res.status(400).json({
        message: 'Pre-debate survey is required. Please complete the survey before joining.'
      });
    }

    if (!['human-human', 'human-ai'].includes(gameMode)) {
      return res.status(400).json({ message: 'Invalid gameMode' });
    }

    if (!['for', 'against', 'unsure'].includes(stance)) {
      return res.status(400).json({ message: 'Invalid stance' });
    }

    const stanceChoice = stance;
    const isUnsure = stanceChoice === 'unsure';

    const topicIdNum = parseInt(topicId);
    const topic = topics.find(t => t.id === topicIdNum);

    if (!topic) {
      return res.status(400).json({ message: 'Invalid topicId' });
    }

    // Check for existing debate
    const existingDebate = await Debate.findOne({
      $or: [
        { player1UserId: userId },
        { player2UserId: userId }
      ],
      status: { $in: ['waiting', 'active'] }
    });

    if (existingDebate) {
      console.log('[Debate] User already in debate:', existingDebate._id);
      if (existingDebate.status === 'waiting' &&
          existingDebate.player1UserId.toString() === userId) {
        console.log('[Debate] Returning existing waiting debate');
        return res.json({
          message: 'You already have a waiting debate',
          debateId: existingDebate._id,
          status: existingDebate.status,
          alreadyJoined: true
        });
      }
      return res.json({
        message: 'You already have an active debate',
        debateId: existingDebate._id,
        status: existingDebate.status,
        alreadyJoined: true
      });
    }

    let joinedDebate = null;

    if (isUnsure) {
      const match = await Debate.findOne({
        gameMode,
        topicId: topicIdNum,
        status: 'waiting',
        player2UserId: null,
        player1UserId: { $ne: userId }
      });

      if (match) {
        // CASE: Both players pick "unsure" - force proper stance assignment
        if (match.player1StanceChoice === 'unsure' && stanceChoice === 'unsure') {
          console.log('[Debate] Both players picked unsure - assigning opposing stances');
          // Re-randomize player1 stance if needed
          let player1Stance = match.player1Stance;
          if (!player1Stance || player1Stance === null) {
            player1Stance = Math.random() < 0.5 ? 'for' : 'against';
          }
          const player2Stance = player1Stance === 'for' ? 'against' : 'for';
          const firstPlayer = determineFirstPlayer(match);

          joinedDebate = await Debate.findOneAndUpdate(
            {
              _id: match._id,
              status: 'waiting',
              player2UserId: null
            },
            {
              $set: {
                player1Stance: player1Stance,
                player2Type: 'human',
                player2UserId: userId,
                player2Stance: player2Stance,
                player2StanceChoice: stanceChoice,
                'currentBelief.player2': stanceChoice,
                status: 'active',
                startedAt: new Date(),
                firstPlayer,
                nextTurn: firstPlayer,
                lastActivityAt: new Date(),
                'preDebateSurvey.player2': preDebateSurvey.player1
              }
            },
            {
              new: true,
              runValidators: true
            }
          );
        } else {
          // NORMAL CASE: At least one player has definite stance
          const assignedStance = match.player1Stance === 'for' ? 'against' : 'for';
          const firstPlayer = determineFirstPlayer(match);
          joinedDebate = await Debate.findOneAndUpdate(
            {
              _id: match._id,
              status: 'waiting',
              player2UserId: null
            },
            {
              $set: {
                player2Type: 'human',
                player2UserId: userId,
                player2Stance: assignedStance,
                player2StanceChoice: stanceChoice,
                'currentBelief.player2': stanceChoice,
                status: 'active',
                startedAt: new Date(),
                firstPlayer,
                nextTurn: firstPlayer,
                lastActivityAt: new Date(),
                'preDebateSurvey.player2': preDebateSurvey.player1
              }
            },
            {
              new: true,
              runValidators: true
            }
          );
        }
      }
    } else {
      const oppositeStance = stanceChoice === 'for' ? 'against' : 'for';
      // Find the match first to get its firstPlayerPreference
      const potentialMatch = await Debate.findOne({
        gameMode,
        topicId: topicIdNum,
        status: 'waiting',
        player1Stance: oppositeStance,
        player2UserId: null,
        player1UserId: { $ne: userId }
      });

      const firstPlayer = potentialMatch ? determineFirstPlayer(potentialMatch) : Math.random() < 0.5 ? 'for' : 'against';
      joinedDebate = await Debate.findOneAndUpdate(
        {
          gameMode,
          topicId: topicIdNum,
          status: 'waiting',
          player1Stance: oppositeStance, // MUST have opposite stance
          player2UserId: null,
          player1UserId: { $ne: userId }
        },
        {
          $set: {
            player2Type: 'human',
            player2UserId: userId,
            player2Stance: stanceChoice,
            player2StanceChoice: stanceChoice,
            'currentBelief.player2': stanceChoice,
            status: 'active',
            startedAt: new Date(),
            firstPlayer,
            nextTurn: firstPlayer,
            lastActivityAt: new Date(),
            'preDebateSurvey.player2': preDebateSurvey.player1 // STORE PLAYER2 SURVEY
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
    }

    if (joinedDebate) {
      console.log('[Debate]  Joined existing debate:', joinedDebate._id);
      console.log('[Debate] Player2 pre-survey:', preDebateSurvey.player1);

      // Initialize Round 0 beliefs from pre-debate survey
      try {
        await initializeRound0Beliefs(joinedDebate, joinedDebate.player1UserId, joinedDebate.player2UserId);
      } catch (error) {
        console.error('[Debate] Error initializing Round 0 beliefs:', error);
        // Don't fail the debate start, just log the error
      }

      const io = req.app.get('io');
      if (io) {
        io.to(`debate:${joinedDebate._id}`).emit('debate:started', {
          debateId: joinedDebate._id,
          firstPlayer: joinedDebate.firstPlayer
        });
        io.to('admin').emit('debate:started', {
          debateId: joinedDebate._id,
          firstPlayer: joinedDebate.firstPlayer
        });
      }

      return res.json({
        message: 'Successfully joined debate!',
        debateId: joinedDebate._id,
        status: 'active',
        firstPlayer: joinedDebate.firstPlayer,
        isPlayer2: true
      });
    }

    // Create new debate
    console.log('[Debate] No matching debate found, creating new...');

    const assignedStance = isUnsure
      ? (Math.random() < 0.5 ? 'for' : 'against')
      : stanceChoice;

    const newDebate = new Debate({
      topicId: topicIdNum,
      topicQuestion: topic.question,
      gameMode,
      player1UserId: userId,
      player1Stance: assignedStance,
      player1StanceChoice: stanceChoice,
      currentBelief: {
        player1: stanceChoice,
        player2: null
      },
      player2Type: null,
      status: 'waiting',
      currentRound: 1,
      maxRounds: 20,
      preDebateSurvey: {
        player1: preDebateSurvey.player1, // STORE PLAYER1 SURVEY
        player2: null // Will be filled when opponent joins
      }
    });

    await newDebate.save();

    console.log('[Debate]  Created new debate:', newDebate._id);
    console.log('[Debate] Player1 pre-survey:', preDebateSurvey.player1);

    // Initialize Round 0 beliefs for player1
    try {
      await initializeRound0Beliefs(newDebate, newDebate.player1UserId, null);
    } catch (error) {
      console.error('[Debate] Error initializing Round 0 beliefs:', error);
      // Don't fail debate creation, just log the error
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('debate:created', {
        debateId: newDebate._id,
        gameMode: newDebate.gameMode,
        topicId: newDebate.topicId
      });
    }

    return res.json({
      message: 'Waiting for opponent to join...',
      debateId: newDebate._id,
      status: 'waiting',
      isPlayer1: true
    });

  } catch (error) {
    console.error('[Debate] ❌ Error joining debate:', error);
    res.status(500).json({
      message: 'Failed to join debate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// ROUTES WITH STATIC PREFIX + PARAMETER
// ============================================

// Get AI personality details
router.get('/ai-personalities/:modelId', authenticate, async (req, res) => {
  try {
    console.log('[Debate] Fetching personality details for:', req.params.modelId);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const details = aiService.getPersonalityDetails(req.params.modelId);
    res.json(details);
  } catch (error) {
    console.error('[Debate] Error fetching personality details:', error);
    res.status(404).json({ message: error.message });
  }
});

// Admin: Match debate with AI
router.post('/:debateId/match-ai', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { aiModel, customPrompt, responseDelay } = req.body;

    console.log('[Debate] Admin matching with AI:', {
      debateId: req.params.debateId,
      aiModel,
      hasCustomPrompt: !!customPrompt,
      admin: req.user.username
    });

    const debate = await Debate.findById(req.params.debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    if (debate.status !== 'waiting') {
      return res.status(400).json({ message: 'Debate is not in waiting status' });
    }

    if (debate.player2UserId || debate.player2Type) {
      return res.status(400).json({ message: 'Debate already has an opponent' });
    }
    // Validate AI model exists
    const aiPersonalities = require('../config/aiPersonalities');
    if (!aiPersonalities[aiModel]) {
      return res.status(400).json({ message: 'Invalid AI model selected' });
    }

    const aiStance = debate.player1Stance === 'for' ? 'against' : 'for';

    // Get the personality type from the selected AI model
    const selectedPersonality = aiPersonalities[aiModel].personality;

    debate.player2Type = 'ai';
    debate.player2AIModel = aiModel; // Use admin-selected model
    debate.player2AIPrompt = customPrompt || null;
    debate.player2Stance = aiStance;
    debate.player2StanceChoice = aiStance;
    debate.currentBelief = debate.currentBelief || {};
    debate.currentBelief.player2 = aiStance;
    debate.gameMode = 'human-ai';
    debate.status = 'active';
    debate.startedAt = new Date();
    debate.firstPlayer = determineFirstPlayer(debate);
    debate.nextTurn = debate.firstPlayer;
    debate.matchedBy = req.user.userId;
    debate.aiEnabled = true;
    debate.aiResponseDelay = responseDelay || 10;

    // ASSIGN AI PRE-SURVEY PERSONALITY
    debate.preDebateSurvey.player2 = selectedPersonality;

    await debate.save();

    console.log('[Debate]  AI opponent matched:', {
      debateId: debate._id,
      aiModel: aiModel,
      aiStance,
      aiPersonality: selectedPersonality,
      firstPlayer: debate.firstPlayer
    });

    // Initialize Round 0 beliefs from pre-debate survey
    try {
      await initializeRound0Beliefs(debate, debate.player1UserId, null);
    } catch (error) {
      console.error('[Debate] Error initializing Round 0 beliefs:', error);
      // Don't fail the debate start, just log the error
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:started', {
        debateId: debate._id,
        firstPlayer: debate.firstPlayer
      });
      io.to('admin').emit('debate:started', {
        debateId: debate._id,
        firstPlayer: debate.firstPlayer
      });
    }

    // If AI goes first, generate opening argument
    if (debate.firstPlayer === aiStance) {
      console.log('[Debate] AI goes first, generating opening argument...');
      setImmediate(async () => {
        try {
          await triggerAIResponse(debate._id, io);
        } catch (error) {
          console.error('[AI] Error generating opening argument:', error);
        }
      });
    }

    res.json({
      message: 'AI opponent matched successfully',
      debate: {
        _id: debate._id,
        status: debate.status,
        gameMode: debate.gameMode,
        firstPlayer: debate.firstPlayer,
        player2Type: debate.player2Type,
        player2AIModel: debate.player2AIModel,
        aiPersonality: selectedPersonality
      }
    });
  } catch (error) {
    console.error('[Debate] Error matching with AI:', error);
    res.status(500).json({ message: 'Failed to match with AI' });
  }
});

// Submit argument
router.post('/:debateId/argument', authenticate, async (req, res) => {
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

    const expectedNextTurn = getExpectedNextTurn(debate);
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
      debate.nextTurn = getOppositeStance(userStance);
    } else if (newRoundArgs.length === 2) {
      debate.nextTurn = null;
      if (debate.player2Type === 'ai') {
        await recordAIBeliefUpdate(debate, debate.currentRound);
      }
    } else {
      throw new Error('Round has more than two arguments');
    }

    await debate.save();

    // Validate turn state after argument submission
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
        debateId: debate._id,
        argument: debate.arguments[debate.arguments.length - 1],
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
      io.to('admin').emit('debate:argumentAdded', {
        debateId: debate._id,
        argument: debate.arguments[debate.arguments.length - 1],
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
    }

    //Trigger AI response immediately after sending response
    if (debate.player2Type === 'ai' && debate.status === 'active' && debate.aiEnabled && debate.nextTurn === debate.player2Stance) {
    const debateId = debate._id;

    console.log('[AI] Scheduling AI response for debate:', debateId);

    setImmediate(async () => {
      try {
        const currentIO = req.app.get('io');
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
});

// Submit round belief update (accepts categorical or numeric beliefValue)
router.post('/:debateId/belief-update', authenticate, async (req, res) => {
  try {
    const { debateId } = req.params;
    const { round, belief, beliefValue, influence, confidence } = req.body;
    const userId = req.user.userId;

    console.log('[Belief] Submit request', {
      debateId,
      userId,
      payload: { round, belief, beliefValue, influence, confidence }
    });

    const roundNumber = parseInt(round, 10);
    if (!roundNumber || roundNumber < 1) {
      return res.status(400).json({ message: 'Invalid round number' });
    }

    // Validate influence
    const influenceScore = parseInt(influence, 10);
    if (Number.isNaN(influenceScore) || influenceScore < 0 || influenceScore > 100) {
      return res.status(400).json({ message: 'Invalid influence score (0-100)' });
    }

    // Validate optional confidence
    let confidenceScore = null;
    if (typeof confidence !== 'undefined' && confidence !== null) {
      confidenceScore = parseInt(confidence, 10);
      if (Number.isNaN(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
        return res.status(400).json({ message: 'Invalid confidence score (0-100)' });
      }
    }

    // Validate belief / beliefValue
    let beliefCategory = null;
    let beliefNumeric = null;

    if (typeof beliefValue !== 'undefined' && beliefValue !== null) {
      const bv = parseInt(beliefValue, 10);
      if (Number.isNaN(bv) || bv < 0 || bv > 100) {
        return res.status(400).json({ message: 'Invalid beliefValue (0-100)' });
      }
      beliefNumeric = bv;
      // Derive categorical belief from value (<=33 -> against, 34-66 -> unsure, >=67 -> for)
      if (bv <= 33) beliefCategory = 'against';
      else if (bv <= 66) beliefCategory = 'unsure';
      else beliefCategory = 'for';
    } else if (belief) {
      if (!['for', 'against', 'unsure'].includes(belief)) {
        return res.status(400).json({ message: 'Invalid belief choice' });
      }
      beliefCategory = belief;
      // Map categorical to numeric defaults
      beliefNumeric = belief === 'for' ? 100 : (belief === 'against' ? 0 : 50);
    } else {
      return res.status(400).json({ message: 'Either belief or beliefValue is required' });
    }

    const debate = await Debate.findById(debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    if (!['active', 'completed'].includes(debate.status)) {
      return res.status(400).json({ message: 'Debate is not active or completed' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;
    const playerKey = isPlayer1 ? 'player1' : 'player2';

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    const roundArgs = debate.arguments.filter(arg => arg.round === roundNumber);
    if (roundArgs.length < 2) {
      console.log('[Belief] Round not complete', { debateId, round: roundNumber, player: playerKey, foundArgs: roundArgs.length });
      return res.status(400).json({ message: 'Round is not complete yet' });
    }

    const alreadySubmitted = (debate.beliefHistory || []).some(entry =>
      entry.round === roundNumber &&
      entry.userId && entry.userId.toString() === userId
    );

    if (alreadySubmitted) {
      console.log('[Belief] Duplicate submit', { debateId, round: roundNumber, player: playerKey });
      return res.status(400).json({ message: 'Belief update already submitted for this round' });
    }

    debate.beliefHistory.push({
      round: roundNumber,
      userId,
      player: isPlayer1 ? 'player1' : 'player2',
      belief: beliefCategory,
      beliefValue: beliefNumeric,
      influence: influenceScore,
      confidence: confidenceScore
    });

    debate.currentBelief = debate.currentBelief || {};
    debate.currentBeliefValue = debate.currentBeliefValue || {};
    if (isPlayer1) {
      debate.currentBelief.player1 = beliefCategory;
      debate.currentBeliefValue.player1 = beliefNumeric;
    } else {
      debate.currentBelief.player2 = beliefCategory;
      debate.currentBeliefValue.player2 = beliefNumeric;
    }

    await debate.save();

    console.log('[Belief] Saved', { debateId, round: roundNumber, player: playerKey });

    if (roundNumber === debate.currentRound) {
      const io = req.app.get('io');
      await maybeAdvanceRoundAfterBeliefs(debate, io);
    }

    res.json({ message: 'Belief update submitted' });
  } catch (error) {
    console.error('[Debate] Error submitting belief update:', error);
    res.status(500).json({ message: 'Failed to submit belief update' });
  }
});

// Skip round belief update
router.post('/:debateId/belief-skip', authenticate, async (req, res) => {
  try {
    const { debateId } = req.params;
    const { round } = req.body;
    const userId = req.user.userId;

    const roundNumber = parseInt(round, 10);
    if (!roundNumber || roundNumber < 1) {
      return res.status(400).json({ message: 'Invalid round number' });
    }

    const debate = await Debate.findById(debateId);
    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    if (!['active', 'completed'].includes(debate.status)) {
      return res.status(400).json({ message: 'Debate is not active or completed' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;
    const playerKey = isPlayer1 ? 'player1' : 'player2';

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    const roundArgs = debate.arguments.filter(arg => arg.round === roundNumber);
    if (roundArgs.length < 2) {
      console.log('[Belief] Skip blocked - round not complete', { debateId, round: roundNumber, player: playerKey, foundArgs: roundArgs.length });
      return res.status(400).json({ message: 'Round is not complete yet' });
    }

    const alreadySubmitted = (debate.beliefHistory || []).some(entry =>
      entry.round === roundNumber && entry.userId && entry.userId.toString() === userId
    );

    if (alreadySubmitted) {
      console.log('[Belief] Duplicate skip', { debateId, round: roundNumber, player: playerKey });
      return res.status(400).json({ message: 'Belief update already submitted for this round' });
    }

    debate.beliefHistory = debate.beliefHistory || [];
    debate.beliefHistory.push({
      round: roundNumber,
      userId,
      player: isPlayer1 ? 'player1' : 'player2',
      belief: null,
      beliefValue: null,
      influence: 0,
      confidence: null,
      skipped: true
    });

    await debate.save();

    console.log('[Belief] Skip saved', { debateId, round: roundNumber, player: playerKey });

    if (roundNumber === debate.currentRound) {
      const io = req.app.get('io');
      await maybeAdvanceRoundAfterBeliefs(debate, io);
    }

    res.json({ message: 'Belief update skipped' });
  } catch (error) {
    console.error('[Debate] Error skipping belief update:', error);
    res.status(500).json({ message: 'Failed to skip belief update' });
  }
});

// Submit reflection / paraphrase after a completed round
router.post('/:debateId/reflection', authenticate, async (req, res) => {
  try {
    const { debateId } = req.params;
    const { round, paraphrase, acknowledgement } = req.body;
    const userId = req.user.userId;

    const roundNumber = parseInt(round, 10);
    if (!roundNumber || roundNumber < 1) {
      return res.status(400).json({ message: 'Invalid round number' });
    }

    if (!paraphrase || typeof paraphrase !== 'string' || paraphrase.trim().length === 0) {
      return res.status(400).json({ message: 'Paraphrase is required' });
    }

    const debate = await Debate.findById(debateId);
    if (!debate) return res.status(404).json({ message: 'Debate not found' });

    if (debate.status !== 'active' && debate.status !== 'completed') {
      return res.status(400).json({ message: 'Debate is not active or completed' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;
    if (!isPlayer1 && !isPlayer2) return res.status(403).json({ message: 'You are not part of this debate' });

    const roundArgs = debate.arguments.filter(arg => arg.round === roundNumber);
    if (roundArgs.length < 2) return res.status(400).json({ message: 'Round is not complete yet' });

    const already = (debate.reflections || []).some(r => r.round === roundNumber && r.userId.toString() === userId);
    if (already) return res.status(400).json({ message: 'Reflection already submitted for this round' });

    debate.reflections = debate.reflections || [];
    debate.reflections.push({ round: roundNumber, userId, paraphrase: paraphrase.trim(), acknowledgement: acknowledgement ? acknowledgement.trim() : '' });

    await debate.save();

    console.log('[Reflection] Saved', { debateId, round: roundNumber, userId });

    res.json({ message: 'Reflection submitted' });
  } catch (error) {
    console.error('[Reflection] Error submitting reflection:', error);
    res.status(500).json({ message: 'Failed to submit reflection' });
  }
});

// Analytics: compute persuasion metrics for a debate
router.get('/:debateId/analytics', authenticate, async (req, res) => {
  try {
    const debate = await Debate.findById(req.params.debateId).populate('player1UserId', 'username').populate('player2UserId', 'username');
    if (!debate) return res.status(404).json({ message: 'Debate not found' });

    // Helper to pick initial numeric belief
    const mapCategoryToNumeric = (cat) => {
      if (!cat) return null;
      if (cat === 'for') return 100;
      if (cat === 'against') return 0;
      return 50; // unsure
    };

    const computeForPlayer = (playerKey, opponentKey, playerUserId, opponentStance) => {
      // Get user's belief entries
      const entries = (debate.beliefHistory || []).filter(e => e.player === playerKey).sort((a,b) => a.round - b.round);

      // initial: first beliefValue if exists, else map playerXStanceChoice or map currentBelief
      let initial = null;
      if (entries.length > 0 && typeof entries[0].beliefValue === 'number') initial = entries[0].beliefValue;
      if (initial === null) {
        // try stanceChoice on debate
        const stanceChoiceField = playerKey === 'player1' ? debate.player1StanceChoice : debate.player2StanceChoice;
        initial = mapCategoryToNumeric(stanceChoiceField) || mapCategoryToNumeric(debate.currentBelief && debate.currentBelief[playerKey]);
      }
      if (initial === null) initial = 50;

      // final
      let final = null;
      const lastEntry = entries.slice(-1)[0];
      if (lastEntry && typeof lastEntry.beliefValue === 'number') final = lastEntry.beliefValue;
      if (final === null) final = debate.currentBeliefValue && debate.currentBeliefValue[playerKey] ? debate.currentBeliefValue[playerKey] : mapCategoryToNumeric(debate.currentBelief && debate.currentBelief[playerKey]) || initial;

      const cumulativeShift = final - initial;

      // Compute influence-weighted persuasion attributed to opponent
      let prev = initial;
      let attribution = 0;
      for (const e of entries) {
        const val = (typeof e.beliefValue === 'number') ? e.beliefValue : (mapCategoryToNumeric(e.belief) || prev);
        const delta = val - prev;
        prev = val;
        // direction: if opponent stance is 'for' (100), positive delta moves toward opponent
        const directionMultiplier = opponentStance === 'for' ? 1 : -1;
        const towardOpponent = delta * directionMultiplier;
        const attributed = towardOpponent * ((e.influence || 0) / 100);
        attribution += attributed;
      }

      return {
        initial,
        final,
        cumulativeShift,
        influenceAttributedToOpponent: attribution // can be negative if moved away from opponent
      };
    };

    const p1 = computeForPlayer('player1','player2', debate.player1UserId, debate.player2Stance);
    const p2 = computeForPlayer('player2','player1', debate.player2UserId, debate.player1Stance);

    res.json({
      debateId: debate._id,
      players: {
        player1: {
          user: debate.player1UserId,
          ...p1
        },
        player2: {
          user: debate.player2UserId,
          ...p2
        }
      }
    });
  } catch (error) {
    console.error('[Debate] Error computing analytics:', error);
    res.status(500).json({ message: 'Failed to compute analytics' });
  }
});

// Admin: Pause/Resume AI
router.put('/:debateId/ai-control', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { aiEnabled } = req.body;

    const debate = await Debate.findByIdAndUpdate(
      req.params.debateId,
      { aiEnabled },
      { new: true }
    );

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    console.log('[Debate] AI control updated:', {
      debateId: debate._id,
      aiEnabled
    });

    res.json({
      message: `AI ${aiEnabled ? 'resumed' : 'paused'}`,
      aiEnabled: debate.aiEnabled
    });
  } catch (error) {
    console.error('[Debate] Error updating AI control:', error);
    res.status(500).json({ message: 'Failed to update AI control' });
  }
});

// Admin: Set first player preference
router.put('/:debateId/first-player', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { firstPlayerPreference } = req.body;

    if (!['for', 'against', 'random'].includes(firstPlayerPreference)) {
      return res.status(400).json({ message: 'Invalid firstPlayerPreference value' });
    }

    const debate = await Debate.findByIdAndUpdate(
      req.params.debateId,
      { firstPlayerPreference },
      { new: true }
    );

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    console.log('[Debate] First player preference updated:', {
      debateId: debate._id,
      firstPlayerPreference
    });

    res.json({
      message: `First player preference set to ${firstPlayerPreference}`,
      firstPlayerPreference: debate.firstPlayerPreference
    });
  } catch (error) {
    console.error('[Debate] Error updating first player preference:', error);
    res.status(500).json({ message: 'Failed to update first player preference' });
  }
});

// Admin: Trigger AI manually
router.post('/:debateId/trigger-ai', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    console.log('[Debate] Admin manually triggering AI response:', req.params.debateId);

    const io = req.app.get('io');
    await triggerAIResponse(req.params.debateId, io);

    res.json({ message: 'AI response triggered' });
  } catch (error) {
    console.error('[Debate] Error triggering AI:', error);
    const message = error.message || 'Failed to trigger AI';
    const isTurnIssue = message.startsWith('Turn state mismatch') ||
      message.startsWith('Turn state missing') ||
      message.startsWith('Not AI\'s turn');
    res.status(isTurnIssue ? 409 : 500).json({ message });
  }
});

// Admin: End debate early
router.put('/:debateId/end-early', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const debate = await Debate.findById(req.params.debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    console.log('[Admin] Ending debate early:', {
      debateId: debate._id,
      currentStatus: debate.status,
      player2Type: debate.player2Type
    });

    // Auto-fill AI post-survey if needed
    if (debate.player2Type === 'ai' && debate.preDebateSurvey.player2) {
      try {
        console.log('[Admin] Generating AI post-survey for debate:', debate._id);
        const aiResponse = await generateAIPostSurvey(debate);
        if (!debate.postDebateSurvey) {
          debate.postDebateSurvey = {};
        }
        debate.postDebateSurvey.player2 = aiResponse;
        console.log('[Admin] AI post-survey set:', aiResponse);
      } catch (aiError) {
        console.error('[Admin] Error generating AI post-survey:', aiError);
        // Continue anyway - post-survey generation failure shouldn't block debate ending
      }
    }

    debate.status = 'survey_pending';
    debate.completedAt = new Date();
    debate.completionReason = 'admin_end_early';
    debate.earlyEndVotes.expired = true;
    debate.nextTurn = null;

    await debate.save();

    console.log('[Admin]  Debate ended successfully:', debate._id);

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:completed', {
        debateId: debate._id.toString(),
        reason: 'Admin ended debate early'
      });
      io.to('admin').emit('debate:completed', {
        debateId: debate._id.toString(),
        reason: 'Admin ended debate early'
      });
    }

    res.json({ message: 'Debate ended', debate });
  } catch (error) {
    console.error('[Admin] ❌ Error ending debate:', error);
    res.status(500).json({
      message: 'Failed to end debate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// EARLY END VOTING ROUTES (Before /:debateId)
// ============================================

// Vote to end debate early
router.post('/:debateId/vote-end', authenticate, async (req, res) => {
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

    // Determine which player is voting
    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    const voteField = isPlayer1 ? 'player1Voted' : 'player2Voted';
    const timestampField = isPlayer1 ? 'player1Timestamp' : 'player2Timestamp';

    // Check if already voted
    if (debate.earlyEndVotes[voteField]) {
      return res.status(400).json({ message: 'You have already voted' });
    }

    // Record vote
    debate.earlyEndVotes[voteField] = true;
    debate.earlyEndVotes[timestampField] = new Date();

    await debate.save();

    console.log('[EarlyEnd] Vote recorded:', {
      debateId: debate._id,
      voter: isPlayer1 ? 'player1' : 'player2',
      gameMode: debate.gameMode
    });

    const io = req.app.get('io');

    // Emit vote update
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:earlyEndVote', {
        debateId: debate._id.toString(),
        votes: {
          player1Voted: debate.earlyEndVotes.player1Voted || false,
          player2Voted: debate.earlyEndVotes.player2Voted || false
        }
      });
    }

    //  Check if both voted (human-human mode)
    if (debate.gameMode === 'human-human') {
      const player1Voted = debate.earlyEndVotes.player1Voted || false;
      const player2Voted = debate.earlyEndVotes.player2Voted || false;

      if (player1Voted && player2Voted) {
        console.log('[EarlyEnd] Both players voted - ending debate');
        await completeDebateEarly(debate._id, 'mutual_consent', io);

        return res.json({
          message: 'Both players agreed - debate ending',
          votesComplete: true
        });
      }
    }

    //  Trigger AI response in human-AI mode
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
});

// Revoke early end vote
router.post('/:debateId/revoke-vote', authenticate, async (req, res) => {
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

    // Check if actually voted
    if (!debate.earlyEndVotes[voteField]) {
      return res.status(400).json({ message: 'You have not voted yet' });
    }

    // Revoke vote
    debate.earlyEndVotes[voteField] = false;
    debate.earlyEndVotes[timestampField] = null;

    // In human-AI mode, clear human vote flag
    if (debate.gameMode === 'human-ai') {
      debate.earlyEndVotes.humanVoted = false;
      // Cancel any pending AI response
      cleanupAITimeout(debate._id);
    }

    await debate.save();

    console.log('[EarlyEnd] Vote revoked:', {
      debateId: debate._id,
      voter: isPlayer1 ? 'player1' : 'player2'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:earlyEndVote', {
        debateId: debate._id,
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
});

// Cancel/Leave waiting debate
router.delete('/:debateId/cancel', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const debate = await Debate.findById(req.params.debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    // Only allow canceling waiting debates
    if (debate.status !== 'waiting') {
      return res.status(400).json({ message: 'Can only cancel waiting debates' });
    }

    // Only player 1 (creator) can cancel
    if (debate.player1UserId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only the debate creator can cancel' });
    }

    // Delete the debate
    await Debate.findByIdAndDelete(req.params.debateId);

    console.log('[Debate]  Debate cancelled:', req.params.debateId, 'by', req.user.username);

    const io = req.app.get('io');
    if (io) {
      io.emit('debate:cancelled', { debateId: req.params.debateId });
    }

    res.json({ message: 'Debate cancelled successfully' });
  } catch (error) {
    console.error('[Debate] Error cancelling debate:', error);
    res.status(500).json({ message: 'Failed to cancel debate' });
  }
});

// ============================================
// PRE-SURVEY & POST-SURVEY ROUTES
// ============================================

// NOTE: Pre-survey is now handled in /join route directly
// This route is kept for backwards compatibility or manual updates

router.post('/:debateId/pre-survey', authenticate, async (req, res) => {
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

    // Determine if player1 or player2
    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Can only submit if debate is still in waiting status
    if (debate.status !== 'waiting') {
      return res.status(400).json({ message: 'Survey can only be submitted before debate starts' });
    }

    // Save response
    if (isPlayer1) {
      debate.preDebateSurvey.player1 = response;

      // Register Round 0 belief for player1 immediately
      const existingPlayer1Round0 = debate.beliefHistory.find(b => b.round === 0 && b.userId?.toString() === userId);
      if (!existingPlayer1Round0) {
        const beliefValue = calculateRound0BeliefValue(response, debate.player1Stance);
        debate.beliefHistory.push({
          round: 0,
          userId: debate.player1UserId,
          player: 'player1',
          beliefValue,
          influence: 0,
          confidence: 0
        });
        console.log('[Pre-Survey]  Registered Round 0 belief for player1:', { beliefValue, response, stance: debate.player1Stance });
      }
    } else if (isPlayer2) {
      debate.preDebateSurvey.player2 = response;

      // Register Round 0 belief for player2 immediately
      const existingPlayer2Round0 = debate.beliefHistory.find(b => b.round === 0 && b.userId?.toString() === userId);
      if (!existingPlayer2Round0) {
        const beliefValue = calculateRound0BeliefValue(response, debate.player2Stance);
        debate.beliefHistory.push({
          round: 0,
          userId: debate.player2UserId,
          player: 'player2',
          beliefValue,
          influence: 0,
          confidence: 0
        });
        console.log('[Pre-Survey]  Registered Round 0 belief for player2:', { beliefValue, response, stance: debate.player2Stance });
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
});

// Submit post-debate survey
router.post('/:debateId/post-survey', authenticate, async (req, res) => {
  try {
    const { debateId } = req.params;
    const { response, opponentPerception,
      stanceStrength,            // NEW: Q2
      stanceConfidence,          // NEW: Q3
      perceptionConfidence,      // Q5
      suspicionTiming,           // Q6
      detectionCues,             // Q7
      detectionOther,            // Q7 - other
      aiAwarenessEffect,         // AI follow-up
      aiAwarenessJustification,  // AI follow-up textbox
      humanAwarenessEffect,      // Human follow-up
      humanAwarenessJustification, // Human follow-up textbox
      unsureAwarenessEffect,     // Unsure follow-up
      unsureAwarenessJustification // Unsure follow-up textbox
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
    const validTimings = ['round_1_2','round_3_4','round_5_7','round_8_12','round_13_17','round_18_20','never_suspected'];
    const validAwarenessEffects = ['no_difference', 'less_persuasive', 'more_persuasive', 'not_sure'];

    if (!response || !validResponses.includes(response)) {
      console.log('Invalid post-survey response:', response);
      return res.status(400).json({
        message: `Invalid response. Must be one of: ${validResponses.join(', ')}`
      });
    }

    //  Validate stance strength/confidence (1-7)
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

    //  Validate opponent perception
    if (opponentPerception && !validPerceptions.includes(opponentPerception)) {
      return res.status(400).json({
        message: 'Invalid opponent perception. Must be one of: human, ai, unsure'
      });
    }
    //  Validate confidence (1-5)
    if (!perceptionConfidence || perceptionConfidence < 1 || perceptionConfidence > 5) {
      return res.status(400).json({
        message: 'Invalid confidence level. Must be between 1 and 5'
      });
    }

    //  Validate timing
    if (!suspicionTiming || !validTimings.includes(suspicionTiming)) {
      return res.status(400).json({
        message: 'Invalid suspicion timing'
      });
    }

    //  Validate detection cues (array)
    if (!detectionCues || !Array.isArray(detectionCues) || detectionCues.length === 0) {
      return res.status(400).json({
        message: 'Please select at least one detection cue'
      });
    }

    //  Validate awareness effect fields based on perception
    if (opponentPerception === 'ai') {
      if (!aiAwarenessEffect || !validAwarenessEffects.includes(aiAwarenessEffect)) {
        return res.status(400).json({
          message: 'Invalid AI awareness effect'
        });
      }
      if (!aiAwarenessJustification || !aiAwarenessJustification.trim()) {
        return res.status(400).json({
          message: 'AI awareness justification is required'
        });
      }
    } else if (opponentPerception === 'human') {
      if (!humanAwarenessEffect || !validAwarenessEffects.includes(humanAwarenessEffect)) {
        return res.status(400).json({
          message: 'Invalid human awareness effect'
        });
      }
      if (!humanAwarenessJustification || !humanAwarenessJustification.trim()) {
        return res.status(400).json({
          message: 'Human awareness justification is required'
        });
      }
    } else if (opponentPerception === 'unsure') {
      if (!unsureAwarenessEffect || !validAwarenessEffects.includes(unsureAwarenessEffect)) {
        return res.status(400).json({
          message: 'Invalid uncertainty awareness effect'
        });
      }
      if (!unsureAwarenessJustification || !unsureAwarenessJustification.trim()) {
        return res.status(400).json({
          message: 'Uncertainty awareness justification is required'
        });
      }
    }

    const debate = await Debate.findById(debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    console.log('[Post-Survey] Debate status check:', {
      debateId,
      status: debate.status,
      requiredStatus: 'survey_pending'
    });

    // Check if debate is in survey_pending state
    if (debate.status !== 'survey_pending') {
      console.log('[Post-Survey] ❌ Status mismatch - survey blocked');
      return res.status(400).json({ message: 'Survey can only be submitted after debate completes' });
    }

    // Determine if player1 or player2
    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Save response
    if (isPlayer1) {
      // Player1 is always human - check if they already submitted
      if (debate.postDebateSurvey.player1) {
        return res.status(400).json({ message: 'Survey already submitted' });
      }
      debate.postDebateSurvey.player1 = response;
      debate.postDebateSurvey.player1OpponentPerception = opponentPerception;
      debate.postDebateSurvey.player1StanceStrength = stanceStrength;
      debate.postDebateSurvey.player1StanceConfidence = stanceConfidence;
      debate.postDebateSurvey.player1PerceptionConfidence = perceptionConfidence;
      debate.postDebateSurvey.player1SuspicionTiming = suspicionTiming;
      debate.postDebateSurvey.player1DetectionCues = detectionCues;
      if (detectionOther) {
        debate.postDebateSurvey.player1DetectionOther = detectionOther;
      }
      if (aiAwarenessEffect) {
        debate.postDebateSurvey.player1AiAwarenessEffect = aiAwarenessEffect;
      }
      if (aiAwarenessJustification) {
        debate.postDebateSurvey.player1AiAwarenessJustification = aiAwarenessJustification;
      }
      if (humanAwarenessEffect) {
        debate.postDebateSurvey.player1HumanAwarenessEffect = humanAwarenessEffect;
      }
      if (humanAwarenessJustification) {
        debate.postDebateSurvey.player1HumanAwarenessJustification = humanAwarenessJustification;
      }
      if (unsureAwarenessEffect) {
        debate.postDebateSurvey.player1UnsureAwarenessEffect = unsureAwarenessEffect;
      }
      if (unsureAwarenessJustification) {
        debate.postDebateSurvey.player1UnsureAwarenessJustification = unsureAwarenessJustification;
      }
      console.log('[Post-Survey]  Saved for player1', { response, opponentPerception, perceptionConfidence, suspicionTiming, detectionCues, detectionOther, aiAwarenessEffect, aiAwarenessJustification, humanAwarenessEffect, humanAwarenessJustification, unsureAwarenessEffect, unsureAwarenessJustification });
    } else if (isPlayer2) {
      // Player2 can be human or AI
      // For human player2: check if they already submitted
      // For AI player2: they're auto-filled, but humans shouldn't re-submit
      if (debate.player2Type === 'human' && debate.postDebateSurvey.player2 !== undefined && debate.postDebateSurvey.player2 !== null) {
        return res.status(400).json({ message: 'Survey already submitted' });
      }
      debate.postDebateSurvey.player2 = response;
      debate.postDebateSurvey.player2OpponentPerception = opponentPerception;
      debate.postDebateSurvey.player2StanceStrength = stanceStrength;
      debate.postDebateSurvey.player2StanceConfidence = stanceConfidence;
      debate.postDebateSurvey.player2PerceptionConfidence = perceptionConfidence;
      debate.postDebateSurvey.player2SuspicionTiming = suspicionTiming;
      debate.postDebateSurvey.player2DetectionCues = detectionCues;
      if (detectionOther) {
        debate.postDebateSurvey.player2DetectionOther = detectionOther;
      }
      if (aiAwarenessEffect) {
        debate.postDebateSurvey.player2AiAwarenessEffect = aiAwarenessEffect;
      }
      if (aiAwarenessJustification) {
        debate.postDebateSurvey.player2AiAwarenessJustification = aiAwarenessJustification;
      }
      if (humanAwarenessEffect) {
        debate.postDebateSurvey.player2HumanAwarenessEffect = humanAwarenessEffect;
      }
      if (humanAwarenessJustification) {
        debate.postDebateSurvey.player2HumanAwarenessJustification = humanAwarenessJustification;
      }
      if (unsureAwarenessEffect) {
        debate.postDebateSurvey.player2UnsureAwarenessEffect = unsureAwarenessEffect;
      }
      if (unsureAwarenessJustification) {
        debate.postDebateSurvey.player2UnsureAwarenessJustification = unsureAwarenessJustification;
      }
      console.log('[Post-Survey]  Saved for player2', { response, opponentPerception, perceptionConfidence, suspicionTiming, detectionCues, detectionOther, aiAwarenessEffect, aiAwarenessJustification, humanAwarenessEffect, humanAwarenessJustification, unsureAwarenessEffect, unsureAwarenessJustification });
    }

    // Check if surveys are ready to mark as complete
    // For AI players: just check if the survey exists (partial OK)
    // For human players: check if survey has the main 'response' field (be strict)
    const player1IsAI = debate.player1Type === 'ai';
    const player2IsAI = debate.player2Type === 'ai';

    const player1Submitted = debate.postDebateSurvey.player1 !== undefined && debate.postDebateSurvey.player1 !== null;
    const player2Submitted = debate.postDebateSurvey.player2 !== undefined && debate.postDebateSurvey.player2 !== null;

    // Only mark as completed when both players have properly submitted
    if (player1Submitted && player2Submitted) {
      debate.status = 'completed';
      console.log('[Post-Survey] ✅ Both surveys submitted - transitioning to completed');
    } else {
      console.log('[Post-Survey] ✅ Survey saved, waiting for other player:', {
        player1Submitted,
        player2Submitted
      });
    }

    console.log('[Post-Survey] About to save debate...', {
      debateId,
      player1HasSurvey: !!debate.postDebateSurvey.player1,
      player2HasSurvey: !!debate.postDebateSurvey.player2
    });

    await debate.save();

    console.log('[Post-Survey] ✅ Successfully saved survey and updated debate');

    res.json({
      message: 'Post-debate survey submitted',
      debate
    });
  } catch (error) {
    console.error('[Post-Survey] ❌ Error submitting post-debate survey:', error);
    console.error('[Post-Survey] Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// DYNAMIC ROUTES LAST (/:debateId)
// ============================================
router.get('/:debateId', authenticate, async (req, res) => {
  try {
    console.log('[Debate] Fetching debate:', req.params.debateId, 'for user:', req.user.username);

    const debate = await Debate.findById(req.params.debateId)
      .populate('player1UserId', 'username')
      .populate('player2UserId', 'username');

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    const userId = req.user.userId;
    const isPlayer1 = debate.player1UserId && debate.player1UserId._id.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId._id.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    // Allow access if:
    // 1. User is player1
    // 2. User is player2 (human opponent)
    // 3. User is admin
    // 4. User is player1 and player2 is AI (no player2UserId)
    const hasAccess = isPlayer1 || isPlayer2 || isAdmin;

    if (!hasAccess) {
      console.log('[Debate] ❌ Access denied for user:', req.user.username);
      return res.status(403).json({ message: 'You are not part of this debate' });
    }

    const yourStance = isPlayer1 ? debate.player1Stance : debate.player2Stance;

    const argumentsWithOwnership = debate.arguments.map(arg => ({
      ...arg.toObject(),
      isYours: arg.stance === yourStance
    }));

    res.json({
      debate: {
        ...debate.toObject(),
        arguments: argumentsWithOwnership,
        yourStance,
        isPlayer1,
        isPlayer2
      }
    });
  } catch (error) {
    console.error('[Debate] Error fetching debate:', error);
    res.status(500).json({ message: 'Failed to fetch debate' });
  }
});


// Helper function: Trigger AI response
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

    const expectedNextTurn = getExpectedNextTurn(debate);
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
      debate.nextTurn = getOppositeStance(debate.player2Stance);
    } else if (newRoundArgs.length === 2) {
      debate.nextTurn = null;
      await recordAIBeliefUpdate(debate, debate.currentRound);
    } else {
      throw new Error('Round has more than two arguments');
    }

    await debate.save();

    // Validate turn state after AI response
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
        debateId: debate._id,
        argument: latestArgument,
        status: debate.status,
        currentRound: debate.currentRound,
        nextTurn: debate.nextTurn
      });
      io.to('admin').emit('debate:argumentAdded', {
        debateId: debate._id,
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

module.exports = router;
module.exports.triggerAIResponse = triggerAIResponse;
module.exports.cleanupAllAITimeouts = cleanupAllAITimeouts;