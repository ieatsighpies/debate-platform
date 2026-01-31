const express = require('express');
const router = express.Router();
const Debate = require('../models/Debate');
const authenticate = require('../middleware/auth');
const aiService = require('../services/aiService');

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

    debate.status = 'completed';
    debate.completedAt = new Date();
    debate.completionReason = reason;
    debate.earlyEndVotes.expired = true;

    await debate.save();

    cleanupAITimeout(debateId);

    console.log('[EarlyEnd] ✅ Debate completed early:', {
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

  console.log('[AI EarlyEnd] ✅ All timeouts cleaned up successfully');

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
const calculateAIThinkingDelay = (debate) => {
  let delay = 3000 + Math.random() * 17000;

  const roundsRemaining = debate.maxRounds - debate.currentRound;

  if (roundsRemaining <= 2) {
    delay *= 0.6;
  }

  if (debate.arguments.length > 15) {
    delay *= 1.3;
  }

  if (Math.random() < 0.1) {
    delay += 10000 + Math.random() * 10000;
  }

  delay = Math.max(3000, Math.min(35000, delay));

  return delay;
};

// ============================================
// HANDLE AI EARLY END VOTE
// ============================================
const handleAIEarlyEndVote = async (debate, io) => {
  try {
    const debateId = debate._id.toString();

    cleanupAITimeout(debateId);

    const aiStrategy = calculateAIVoteStrategy(debate);
    const thinkingDelay = calculateAIThinkingDelay(debate);

    console.log('[AI EarlyEnd] AI will respond in', (thinkingDelay / 1000).toFixed(1), 'seconds');
    console.log('[AI EarlyEnd] AI decision:', aiStrategy.shouldAgree ? 'AGREE' : 'DECLINE');
    console.log('[AI EarlyEnd] Confidence:', (aiStrategy.confidence * 100).toFixed(1) + '%');

    const timeoutId = setTimeout(async () => {
      try {
        const currentDebate = await Debate.findOne({
          _id: debateId,
          status: 'active',
          gameMode: 'human-ai'
        });

        if (!currentDebate) {
          console.log('[AI EarlyEnd] ❌ Debate no longer active');
          aiVoteTimeouts.delete(debateId);
          return;
        }

        if (!currentDebate.earlyEndVotes.humanVoted) {
          console.log('[AI EarlyEnd] ❌ Human revoked vote, cancelling AI response');
          aiVoteTimeouts.delete(debateId);
          return;
        }

        if (currentDebate.earlyEndVotes.expired) {
          console.log('[AI EarlyEnd] ❌ Votes expired, ignoring');
          aiVoteTimeouts.delete(debateId);
          return;
        }

        if (aiStrategy.shouldAgree) {
          console.log('[AI EarlyEnd] ✅ AI voting to end debate');

          const updatedDebate = await Debate.findOneAndUpdate(
            {
              _id: debateId,
              status: 'active',
              'earlyEndVotes.player2Voted': { $ne: true }
            },
            {
              $set: {
                'earlyEndVotes.player2Voted': true,
                'earlyEndVotes.player2Timestamp': new Date()
              }
            },
            { new: true }
          );

          if (updatedDebate) {
            if (io) {
              io.to(`debate:${debateId}`).emit('debate:earlyEndVote', {
                debateId,
                votes: {
                  player1Voted: true,
                  player2Voted: true,
                  yourVote: true
                }
              });
            }

            await completeDebateEarly(debateId, 'mutual_consent_ai', io);
            console.log('[AI EarlyEnd] ✅ Debate ended by mutual consent');
          }
        } else {
          console.log('[AI EarlyEnd] 🤐 AI declined to vote - no action taken');
        }

        aiVoteTimeouts.delete(debateId);

      } catch (error) {
        console.error('[AI EarlyEnd] ❌ Error in timeout handler:', error);
        aiVoteTimeouts.delete(debateId);
      }
    }, thinkingDelay);

    aiVoteTimeouts.set(debateId, timeoutId);

  } catch (error) {
    console.error('[AI EarlyEnd] ❌ Error setting up AI vote:', error);
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

    const existingDebate = await Debate.findOne({
      $or: [
        { player1UserId: userId },
        { player2UserId: userId }
      ],
      status: { $in: ['waiting', 'active'] }
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

    if (!['for', 'against'].includes(stance)) {
      return res.status(400).json({ message: 'Invalid stance' });
    }

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

    // Calculate opposite stance
    const oppositeStance = stance === 'for' ? 'against' : 'for';

    // Try to join existing debate with OPPOSITE stance
    const joinedDebate = await Debate.findOneAndUpdate(
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
          player2Stance: stance, // This user's chosen stance
          status: 'active',
          startedAt: new Date(),
          firstPlayer: Math.random() < 0.5 ? 'for' : 'against',
          lastActivityAt: new Date(),
          'preDebateSurvey.player2': preDebateSurvey.player1 // STORE PLAYER2 SURVEY
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (joinedDebate) {
      console.log('[Debate] ✅ Joined existing debate:', joinedDebate._id);
      console.log('[Debate] Player2 pre-survey:', preDebateSurvey.player1);

      const io = req.app.get('io');
      if (io) {
        io.to(`debate:${joinedDebate._id}`).emit('debate:started', {
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

    const newDebate = new Debate({
      topicId: topicIdNum,
      topicQuestion: topic.question,
      gameMode,
      player1UserId: userId,
      player1Stance: stance,
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

    console.log('[Debate] ✅ Created new debate:', newDebate._id);
    console.log('[Debate] Player1 pre-survey:', preDebateSurvey.player1);

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
    debate.gameMode = 'human-ai';
    debate.status = 'active';
    debate.startedAt = new Date();
    debate.firstPlayer = Math.random() < 0.5 ? 'for' : 'against';
    debate.matchedBy = req.user.userId;
    debate.aiEnabled = true;
    debate.aiResponseDelay = responseDelay || 10;

    // ASSIGN AI PRE-SURVEY PERSONALITY
    debate.preDebateSurvey.player2 = selectedPersonality;

    await debate.save();

    console.log('[Debate] ✅ AI opponent matched:', {
      debateId: debate._id,
      aiModel: aiModelId,
      aiStance,
      aiPersonality: randomAIPersonality,
      firstPlayer: debate.firstPlayer
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:started', {
        debateId: debate._id,
        firstPlayer: debate.firstPlayer
      });
    }

    // If AI goes first, generate opening argument
    if (debate.firstPlayer === aiStance) {
      console.log('[Debate] AI goes first, generating opening argument...');
      setTimeout(async () => {
        await triggerAIResponse(debate._id, io);
      }, debate.aiResponseDelay * 1000);
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
        aiPersonality: randomAIPersonality
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

    let isUserTurn = false;
    if (currentRoundArgs.length === 0) {
      isUserTurn = (debate.firstPlayer === userStance);
    } else if (currentRoundArgs.length === 1) {
      isUserTurn = (currentRoundArgs[0].stance !== userStance);
    }

    if (!isUserTurn) {
      return res.status(400).json({ message: 'Not your turn' });
    }

    debate.arguments.push({
      stance: userStance,
      text: text.trim(),
      round: debate.currentRound,
      submittedBy: 'human'
    });

    const newRoundArgs = debate.arguments.filter(arg => arg.round === debate.currentRound);
    if (newRoundArgs.length === 2) {
      if (debate.currentRound >= debate.maxRounds) {
        // AUTO-FILL AI POST-SURVEY
        if (debate.player2Type === 'ai' && debate.preDebateSurvey.player2) {
          console.log('[Debate] Generating AI post-survey response...');
          const aiResponse = await generateAIPostSurvey(debate);
          debate.postDebateSurvey.player2 = aiResponse;
          console.log('[Debate] AI post-survey:', aiResponse);
        }

        debate.status = 'completed';
        debate.completedAt = new Date();
        debate.completionReason = 'natural_completion';
        debate.earlyEndVotes.expired = true;
        cleanupAITimeout(debate._id);
      } else {
        debate.currentRound += 1;
      }
    }

    await debate.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:argumentAdded', {
        debateId: debate._id,
        argument: debate.arguments[debate.arguments.length - 1],
        status: debate.status,
        currentRound: debate.currentRound
      });
    }

    // ✅ FIXED: Trigger AI response immediately after sending response
    // This ensures we don't lose the reference and the function executes
    if (debate.player2Type === 'ai' && debate.status === 'active' && debate.aiEnabled) {
      const delay = (debate.aiResponseDelay || 10) * 1000;
      const debateId = debate._id;

      console.log(`[AI] Scheduling AI response in ${delay / 1000} seconds for debate:`, debateId);

      // Use setImmediate to ensure this runs after response is sent
      setImmediate(async () => {
        setTimeout(async () => {
          try {
            console.log(`[AI] Executing scheduled AI response for debate:`, debateId);
            const currentIO = req.app.get('io'); // Get fresh io reference
            await triggerAIResponse(debateId, currentIO);
          } catch (error) {
            console.error('[AI] Error in scheduled response:', error);
          }
        }, delay);
      });
    }

    res.json({ debate });
  } catch (error) {
    console.error('[Debate] Error submitting argument:', error);
    res.status(500).json({ message: 'Failed to submit argument' });
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
    res.status(500).json({ message: error.message });
  }
});

// Admin: End debate early
router.put('/:debateId/end-early', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const debate = await Debate.findByIdAndUpdate(
      req.params.debateId,
      {
        status: 'completed',
        completedAt: new Date()
      },
      { new: true }
    );

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:completed', {
        debateId: debate._id,
        reason: 'Admin ended debate early'
      });
    }

    res.json({ message: 'Debate ended', debate });
  } catch (error) {
    console.error('[Debate] Error ending debate:', error);
    res.status(500).json({ message: 'Failed to end debate' });
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

    // Check if minimum rounds requirement met
    if (debate.currentRound < 5) {
      return res.status(400).json({ message: 'Must complete at least 5 rounds before ending early' });
    }

    // Check if votes already expired
    if (debate.earlyEndVotes.expired) {
      return res.status(400).json({ message: 'Voting has expired for this debate' });
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

    // In human-AI mode, mark that human voted
    if (debate.gameMode === 'human-ai') {
      debate.earlyEndVotes.humanVoted = true;
    }

    await debate.save();

    console.log('[EarlyEnd] Vote recorded:', {
      debateId: debate._id,
      voter: isPlayer1 ? 'player1' : 'player2',
      gameMode: debate.gameMode
    });

    const io = req.app.get('io');

    // Check if both voted (human-human mode)
    if (debate.gameMode === 'human-human' &&
        debate.earlyEndVotes.player1Voted &&
        debate.earlyEndVotes.player2Voted) {

      console.log('[EarlyEnd] Both players voted - ending debate');
      await completeDebateEarly(debate._id, 'mutual_consent', io);

      return res.json({
        message: 'Both players agreed - debate ending',
        votesComplete: true
      });
    }

    // Emit vote update
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

    // Trigger AI response in human-AI mode
    if (debate.gameMode === 'human-ai' && debate.earlyEndVotes.humanVoted) {
      console.log('[EarlyEnd] Human voted in AI mode - triggering AI response');
      handleAIEarlyEndVote(debate, io);
    }

    res.json({
      message: 'Vote recorded',
      votes: {
        player1Voted: debate.earlyEndVotes.player1Voted,
        player2Voted: debate.earlyEndVotes.player2Voted
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

    console.log('[Debate] ✅ Debate cancelled:', req.params.debateId, 'by', req.user.username);

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
    } else if (isPlayer2) {
      debate.preDebateSurvey.player2 = response;
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
    const { response } = req.body;
    const userId = req.user.userId;

    const validResponses = ['still_firm', 'opponent_made_points', 'convinced_to_change'];

    if (!response || !validResponses.includes(response)) {
      return res.status(400).json({
        message: 'Invalid response. Must be one of: still_firm, opponent_made_points, convinced_to_change'
      });
    }

    const debate = await Debate.findById(debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    // Check if debate is completed
    if (debate.status !== 'completed') {
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
      if (debate.postDebateSurvey.player1) {
        return res.status(400).json({ message: 'Survey already submitted' });
      }
      debate.postDebateSurvey.player1 = response;
    } else if (isPlayer2) {
      if (debate.postDebateSurvey.player2) {
        return res.status(400).json({ message: 'Survey already submitted' });
      }
      debate.postDebateSurvey.player2 = response;
    }

    await debate.save();

    res.json({
      message: 'Post-debate survey submitted',
      debate
    });
  } catch (error) {
    console.error('Error submitting post-debate survey:', error);
    res.status(500).json({ message: 'Server error' });
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

    const currentRoundArgs = debate.arguments.filter(arg => arg.round === debate.currentRound);
    let isAITurn = false;

    if (currentRoundArgs.length === 0) {
      isAITurn = (debate.firstPlayer === debate.player2Stance);
    } else if (currentRoundArgs.length === 1) {
      isAITurn = (currentRoundArgs[0].stance !== debate.player2Stance);
    }

    if (!isAITurn) {
      console.log('[AI] Not AI\'s turn yet');
      return;
    }

    console.log('[AI] Generating AI argument...');

    const aiArgument = await aiService.generateArgument(debate);

    debate.arguments.push({
      stance: debate.player2Stance,
      text: aiArgument,
      round: debate.currentRound,
      submittedBy: 'ai'
    });

    debate.aiLastResponseAt = new Date();

    const newRoundArgs = debate.arguments.filter(arg => arg.round === debate.currentRound);
    if (newRoundArgs.length === 2) {
      if (debate.currentRound >= debate.maxRounds) {
        debate.status = 'completed';
        debate.completedAt = new Date();
      } else {
        debate.currentRound += 1;
      }
    }

    await debate.save();

    console.log('[AI] ✅ AI argument submitted');

    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:argumentAdded', {
        debateId: debate._id,
        argument: debate.arguments[debate.arguments.length - 1],
        status: debate.status,
        currentRound: debate.currentRound
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