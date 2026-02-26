const Debate = require('../models/Debate');
const aiPersonalities = require('../config/aiPersonalities');
const { triggerAIResponse } = require('../routes/debates');
const turnValidator = require('./turnValidator');

const DEFAULT_WAIT_MS = 60 * 1000;
const DEFAULT_INTERVAL_MS = 30 * 1000;
const DEFAULT_BATCH_LIMIT = 10;

function getDefaultAIModel() {
  const configured = process.env.AUTO_MATCH_AI_MODEL;
  if (configured && aiPersonalities[configured]) {
    return configured;
  }

  if (aiPersonalities['balanced-debater']) {
    return 'balanced-debater';
  }

  const fallback = Object.keys(aiPersonalities)[0];
  return fallback || null;
}

async function autoMatchWaitingDebates(io, options = {}) {
  const waitMs = Number(options.waitMs || process.env.AUTO_MATCH_WAIT_MS || DEFAULT_WAIT_MS);
  const limit = Number(options.limit || process.env.AUTO_MATCH_BATCH_LIMIT || DEFAULT_BATCH_LIMIT);
  const aiModel = options.aiModel || process.env.AUTO_MATCH_AI_MODEL || getDefaultAIModel();

  if (!aiModel || !aiPersonalities[aiModel]) {
    console.warn('[AutoMatch] No valid AI model configured. Skipping run.');
    return;
  }

  const cutoff = new Date(Date.now() - waitMs);

  const candidates = await Debate.find({
    status: 'waiting',
    createdAt: { $lte: cutoff },
    player2UserId: null,
    player2Type: null
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  if (candidates.length === 0) {
    return;
  }

  for (const debate of candidates) {
    const aiStance = debate.player1Stance === 'for' ? 'against' : 'for';
    const selectedPersonality = aiPersonalities[aiModel].personality;
    const firstPlayer = Math.random() < 0.5 ? 'for' : 'against';

    const updated = await Debate.findOneAndUpdate(
      {
        _id: debate._id,
        status: 'waiting',
        player2UserId: null,
        player2Type: null
      },
      {
        $set: {
          player2Type: 'ai',
          player2AIModel: aiModel,
          player2AIPrompt: null,
          player2Stance: aiStance,
          gameMode: 'human-ai',
          status: 'active',
          startedAt: new Date(),
          firstPlayer,
          nextTurn: firstPlayer,
          matchedBy: null,
          aiEnabled: true,
          aiResponseDelay: 10,
          'preDebateSurvey.player2': selectedPersonality
        }
      },
      { new: true }
    );

    if (!updated) {
      continue;
    }

    // Validate turn state after matching
    const validation = turnValidator.validateTurnState(updated);
    if (!validation.isValid) {
      console.warn('[AutoMatch] Turn state validation failed after matching:', {
        debateId: updated._id,
        errors: validation.errors
      });
    }

    console.log('[AutoMatch]  Matched waiting debate with AI:', {
      debateId: updated._id,
      aiModel,
      aiStance,
      aiPersonality: selectedPersonality,
      firstPlayer: updated.firstPlayer
    });

    if (io) {
      io.to(`debate:${updated._id}`).emit('debate:started', {
        debateId: updated._id,
        firstPlayer: updated.firstPlayer
      });
    }

    if (updated.firstPlayer === aiStance) {
      setImmediate(async () => {
        try {
          await triggerAIResponse(updated._id, io);
        } catch (error) {
          console.error('[AutoMatch] Error generating opening argument:', error);
        }
      });
    }
  }
}

function startAutoMatchJob(io, intervalMs = DEFAULT_INTERVAL_MS) {
  const enabled = process.env.AUTO_MATCH_ENABLED !== 'false';
  if (!enabled) {
    console.log('[AutoMatch] Disabled via AUTO_MATCH_ENABLED=false');
    return null;
  }

  console.log(`[AutoMatch] Starting auto-match job (runs every ${Math.round(intervalMs / 1000)}s)`);

  autoMatchWaitingDebates(io).catch((error) => {
    console.error('[AutoMatch] Error during initial run:', error);
  });

  const job = setInterval(() => {
    autoMatchWaitingDebates(io).catch((error) => {
      console.error('[AutoMatch] Error during run:', error);
    });
  }, intervalMs);

  process.on('SIGTERM', () => {
    clearInterval(job);
  });

  return job;
}

module.exports = { autoMatchWaitingDebates, startAutoMatchJob };
