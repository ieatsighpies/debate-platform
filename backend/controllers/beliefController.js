/**
 * Belief Controller
 * Handles belief updates and reflections after argument rounds
 */

const Debate = require('../models/Debate');
const debateService = require('../services/debateService');

/**
 * Submit belief update for a round
 * POST /api/debates/:debateId/belief-update
 */
exports.submitBeliefUpdate = async (req, res) => {
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

    const influenceScore = parseInt(influence, 10);
    if (Number.isNaN(influenceScore) || influenceScore < 0 || influenceScore > 100) {
      return res.status(400).json({ message: 'Invalid influence score (0-100)' });
    }

    const confidenceScore = parseInt(confidence, 10);
    if (Number.isNaN(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
      return res.status(400).json({ message: 'Confidence score is required (0-100)' });
    }

    let beliefCategory = null;
    let beliefNumeric = null;

    if (typeof beliefValue !== 'undefined' && beliefValue !== null) {
      const bv = parseInt(beliefValue, 10);
      if (Number.isNaN(bv) || bv < 0 || bv > 100) {
        return res.status(400).json({ message: 'Invalid beliefValue (0-100)' });
      }
      beliefNumeric = bv;
      if (bv <= 33) beliefCategory = 'against';
      else if (bv <= 66) beliefCategory = 'unsure';
      else beliefCategory = 'for';
    } else if (belief) {
      if (!['for', 'against', 'unsure'].includes(belief)) {
        return res.status(400).json({ message: 'Invalid belief choice' });
      }
      beliefCategory = belief;
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
      await debateService.maybeAdvanceRoundAfterBeliefs(debate, io);
    }

    res.json({ message: 'Belief update submitted' });
  } catch (error) {
    console.error('[Debate] Error submitting belief update:', error);
    res.status(500).json({ message: 'Failed to submit belief update' });
  }
};

/**
 * Skip belief update (disabled)
 * POST /api/debates/:debateId/belief-skip
 */
exports.skipBeliefUpdate = (req, res) => {
  return res.status(410).json({ message: 'Belief skip is disabled. Please submit all belief check inputs.' });
};

/**
 * Submit reflection/paraphrase after a round
 * POST /api/debates/:debateId/reflection
 */
exports.submitReflection = async (req, res) => {
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

    if (!acknowledgement || typeof acknowledgement !== 'string' || acknowledgement.trim().length === 0) {
      return res.status(400).json({ message: 'Acknowledgement is required' });
    }

    const debate = await Debate.findById(debateId);
    if (!debate) return res.status(404).json({ message: 'Debate not found' });

    if (debate.status !== 'active' && debate.status !== 'completed') {
      return res.status(400).json({ message: 'Debate is not active or completed' });
    }

    const isPlayer1 = debate.player1UserId.toString() === userId;
    const isPlayer2 = debate.player2UserId && debate.player2UserId.toString() === userId;
    if (!isPlayer1 && !isPlayer2) return res.status(403).json({ message: 'You are not part of this debate' });
    const playerKey = isPlayer1 ? 'player1' : 'player2';

    const roundArgs = debate.arguments.filter(arg => arg.round === roundNumber);
    if (roundArgs.length < 2) return res.status(400).json({ message: 'Round is not complete yet' });

    const already = (debate.reflections || []).some(r => r.round === roundNumber && r.userId.toString() === userId);
    if (already) return res.status(400).json({ message: 'Reflection already submitted for this round' });

    debate.reflections = debate.reflections || [];
    debate.reflections.push({
      round: roundNumber,
      userId,
      player: playerKey,
      paraphrase: paraphrase.trim(),
      acknowledgement: acknowledgement.trim()
    });

    await debate.save();

    if (roundNumber === debate.currentRound && debate.status === 'active') {
      const io = req.app.get('io');
      await debateService.maybeAdvanceRoundAfterBeliefs(debate, io);
    }

    console.log('[Reflection] Saved', { debateId, round: roundNumber, userId });

    res.json({ message: 'Reflection submitted' });
  } catch (error) {
    console.error('[Reflection] Error submitting reflection:', error);
    res.status(500).json({ message: 'Failed to submit reflection' });
  }
};

module.exports = exports;
