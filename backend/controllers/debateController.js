/**
 * Debate Controller
 * Handles core debate gameplay endpoints (join, create, list, match AI, etc.)
 */

const Debate = require('../models/Debate');
const aiService = require('../services/aiService');
const debateService = require('../services/debateService');

// Topics for debates
const topics = [
  { id: 1, question: "Should we use ChatGPT for homework?" },
  { id: 2, question: "Does pineapple belong on pizza?" },
  { id: 3, question: "Go for higher pay at expense of social life (For) or take lower pay to enjoy life (Against)?" }
];

/**
 * Get available debate topics
 * GET /api/debates/topics
 */
exports.getTopics = (req, res) => {
  res.json({ topics });
};

/**
 * Get all debates (admin only)
 * GET /api/debates/all-debates
 */
exports.getAllDebates = async (req, res) => {
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
    res.status(500).json({
      message: 'Failed to fetch debates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check if user has active/waiting debate
 * GET /api/debates/my-status
 */
exports.getMyStatus = async (req, res) => {
  try {
    const userId = req.user.userId;

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
};

/**
 * Get available AI personalities (admin only)
 * GET /api/debates/ai-personalities
 */
exports.getAIPersonalities = async (req, res) => {
  try {
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
};

/**
 * Get specific AI personality details (admin only)
 * GET /api/debates/ai-personalities/:modelId
 */
exports.getAIPersonalityDetails = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const details = aiService.getPersonalityDetails(req.params.modelId);
    res.json(details);
  } catch (error) {
    console.error('[Debate] Error fetching personality details:', error);
    res.status(404).json({ message: error.message });
  }
};

/**
 * Join or create a debate
 * POST /api/debates/join
 */
exports.joinDebate = async (req, res) => {
  try {
    const { gameMode, topicId, stance, preDebateSurvey } = req.body;
    const userId = req.user.userId;

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
      preSurvey: preDebateSurvey?.player1
    });

    // Validation
    if (!gameMode || !topicId || !stance) {
      return res.status(400).json({ message: 'Missing required fields: gameMode, topicId, stance' });
    }

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
      if (existingDebate.status === 'waiting' && existingDebate.player1UserId.toString() === userId) {
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
        if (match.player1StanceChoice === 'unsure' && stanceChoice === 'unsure') {
          console.log('[Debate] Both players picked unsure - assigning opposing stances');
          let player1Stance = match.player1Stance;
          if (!player1Stance || player1Stance === null) {
            player1Stance = Math.random() < 0.5 ? 'for' : 'against';
          }
          const player2Stance = player1Stance === 'for' ? 'against' : 'for';
          const firstPlayer = debateService.determineFirstPlayer(match);

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
          const assignedStance = match.player1Stance === 'for' ? 'against' : 'for';
          const firstPlayer = debateService.determineFirstPlayer(match);
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
      const potentialMatch = await Debate.findOne({
        gameMode,
        topicId: topicIdNum,
        status: 'waiting',
        player1Stance: oppositeStance,
        player2UserId: null,
        player1UserId: { $ne: userId }
      });

      const firstPlayer = potentialMatch ? debateService.determineFirstPlayer(potentialMatch) : Math.random() < 0.5 ? 'for' : 'against';
      joinedDebate = await Debate.findOneAndUpdate(
        {
          gameMode,
          topicId: topicIdNum,
          status: 'waiting',
          player1Stance: oppositeStance,
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
            'preDebateSurvey.player2': preDebateSurvey.player1
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

      try {
        await debateService.initializeRound0Beliefs(joinedDebate, joinedDebate.player1UserId, joinedDebate.player2UserId);
      } catch (error) {
        console.error('[Debate] Error initializing Round 0 beliefs:', error);
      }

      const io = req.app.get('io');
      if (io) {
        io.to(`debate:${joinedDebate._id}`).emit('debate:started', {
          debateId: joinedDebate._id.toString(),
          firstPlayer: joinedDebate.firstPlayer
        });
        io.to('admin').emit('debate:started', {
          debateId: joinedDebate._id.toString(),
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
        player1: preDebateSurvey.player1,
        player2: null
      }
    });

    await newDebate.save();
    console.log('[Debate]  Created new debate:', newDebate._id);

    try {
      await debateService.initializeRound0Beliefs(newDebate, newDebate.player1UserId, null);
    } catch (error) {
      console.error('[Debate] Error initializing Round 0 beliefs:', error);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('debate:created', {
        debateId: newDebate._id.toString(),
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
};

/**
 * Match a waiting debate with an AI opponent (admin only)
 * POST /api/debates/:debateId/match-ai
 */
exports.matchWithAI = async (req, res) => {
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

    const aiPersonalities = require('../config/aiPersonalities');
    if (!aiPersonalities[aiModel]) {
      return res.status(400).json({ message: 'Invalid AI model selected' });
    }

    const aiStance = debate.player1Stance === 'for' ? 'against' : 'for';
    const selectedPersonality = aiPersonalities[aiModel].personality;

    debate.player2Type = 'ai';
    debate.player2AIModel = aiModel;
    debate.player2AIPrompt = customPrompt || null;
    debate.player2Stance = aiStance;
    debate.player2StanceChoice = aiStance;
    debate.currentBelief = debate.currentBelief || {};
    debate.currentBelief.player2 = aiStance;
    debate.gameMode = 'human-ai';
    debate.status = 'active';
    debate.startedAt = new Date();
    debate.firstPlayer = debateService.determineFirstPlayer(debate);
    debate.nextTurn = debate.firstPlayer;
    debate.matchedBy = req.user.userId;
    debate.aiEnabled = true;
    debate.aiResponseDelay = responseDelay || 10;
    debate.preDebateSurvey.player2 = selectedPersonality;

    await debate.save();

    console.log('[Debate]  AI opponent matched:', {
      debateId: debate._id,
      aiModel: aiModel,
      aiStance,
      aiPersonality: selectedPersonality,
      firstPlayer: debate.firstPlayer
    });

    try {
      await debateService.initializeRound0Beliefs(debate, debate.player1UserId, null);
    } catch (error) {
      console.error('[Debate] Error initializing Round 0 beliefs:', error);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`debate:${debate._id}`).emit('debate:started', {
        debateId: debate._id.toString(),
        firstPlayer: debate.firstPlayer
      });
      io.to('admin').emit('debate:started', {
        debateId: debate._id.toString(),
        firstPlayer: debate.firstPlayer
      });
    }

    if (debate.firstPlayer === aiStance) {
      console.log('[Debate] AI goes first, generating opening argument...');
      setImmediate(async () => {
        try {
          const { triggerAIResponse } = require('../services/aiDebateService');
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
};

/**
 * Get analytics for a debate
 * GET /api/debates/:debateId/analytics
 */
exports.getAnalytics = async (req, res) => {
  try {
    const debate = await Debate.findById(req.params.debateId)
      .populate('player1UserId', 'username')
      .populate('player2UserId', 'username');

    if (!debate) return res.status(404).json({ message: 'Debate not found' });

    const mapCategoryToNumeric = (cat) => {
      if (!cat) return null;
      if (cat === 'for') return 100;
      if (cat === 'against') return 0;
      return 50;
    };

    const computeForPlayer = (playerKey, opponentStance) => {
      const entries = (debate.beliefHistory || []).filter(e => e.player === playerKey).sort((a, b) => a.round - b.round);

      let initial = null;
      if (entries.length > 0 && typeof entries[0].beliefValue === 'number') initial = entries[0].beliefValue;
      if (initial === null) {
        const stanceChoiceField = playerKey === 'player1' ? debate.player1StanceChoice : debate.player2StanceChoice;
        initial = mapCategoryToNumeric(stanceChoiceField) || mapCategoryToNumeric(debate.currentBelief && debate.currentBelief[playerKey]);
      }
      if (initial === null) initial = 50;

      let final = null;
      const lastEntry = entries.slice(-1)[0];
      if (lastEntry && typeof lastEntry.beliefValue === 'number') final = lastEntry.beliefValue;
      if (final === null) final = debate.currentBeliefValue && debate.currentBeliefValue[playerKey] ? debate.currentBeliefValue[playerKey] : mapCategoryToNumeric(debate.currentBelief && debate.currentBelief[playerKey]) || initial;

      const cumulativeShift = final - initial;

      let prev = initial;
      let attribution = 0;
      for (const e of entries) {
        const val = (typeof e.beliefValue === 'number') ? e.beliefValue : (mapCategoryToNumeric(e.belief) || prev);
        const delta = val - prev;
        prev = val;
        const directionMultiplier = opponentStance === 'for' ? 1 : -1;
        const towardOpponent = delta * directionMultiplier;
        const attributed = towardOpponent * ((e.influence || 0) / 100);
        attribution += attributed;
      }

      return {
        initial,
        final,
        cumulativeShift,
        influenceAttributedToOpponent: attribution
      };
    };

    const p1 = computeForPlayer('player1', debate.player2Stance);
    const p2 = computeForPlayer('player2', debate.player1Stance);

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
};

/**
 * Control AI (pause/resume) - admin only
 * PUT /api/debates/:debateId/ai-control
 */
exports.setAIControl = async (req, res) => {
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
};

/**
 * Set first player preference - admin only
 * PUT /api/debates/:debateId/first-player
 */
exports.setFirstPlayerPreference = async (req, res) => {
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
};

/**
 * Cancel a waiting debate
 * DELETE /api/debates/:debateId/cancel
 */
exports.cancelDebate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const debate = await Debate.findById(req.params.debateId);

    if (!debate) {
      return res.status(404).json({ message: 'Debate not found' });
    }

    if (debate.status !== 'waiting') {
      return res.status(400).json({ message: 'Can only cancel waiting debates' });
    }

    if (debate.player1UserId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only the debate creator can cancel' });
    }

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
};

module.exports = exports;
