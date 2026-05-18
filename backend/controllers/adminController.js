/**
 * Admin Controller
 * Handles admin-only operations (trigger AI, end debate early, etc.)
 */

const Debate = require('../models/Debate');
const debateService = require('../services/debateService');

/**
 * Manually trigger AI response (admin only)
 * POST /api/debates/:debateId/trigger-ai
 */
exports.triggerAI = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    console.log('[Debate] Admin manually triggering AI response:', req.params.debateId);

    const io = req.app.get('io');
    const { triggerAIResponse } = require('../services/aiDebateService');
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
};

/**
 * End debate early (admin only)
 * PUT /api/debates/:debateId/end-early
 */
exports.endDebateEarly = async (req, res) => {
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

    if (debate.player2Type === 'ai' && debate.preDebateSurvey.player2) {
      try {
        console.log('[Admin] Generating AI post-survey for debate:', debate._id);
        const aiResponse = await debateService.generateAIPostSurvey(debate);
        if (!debate.postDebateSurvey) {
          debate.postDebateSurvey = {};
        }
        debate.postDebateSurvey.player2 = aiResponse;
        console.log('[Admin] AI post-survey set:', aiResponse);
      } catch (aiError) {
        console.error('[Admin] Error generating AI post-survey:', aiError);
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
};

module.exports = exports;
