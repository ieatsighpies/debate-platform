// utils/debateCleanup.js
const Debate = require('../models/Debate');

async function cleanupStaleDebates(io) {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Mark waiting debates older than 5 minutes as abandoned
    const abandonedWaiting = await Debate.updateMany(
      {
        status: 'waiting',
        createdAt: { $lt: fiveMinutesAgo }
      },
      {
        $set: { status: 'abandoned' }
      }
    );

    // Mark active debates with no activity in 1 day as abandoned
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const abandonedActive = await Debate.updateMany(
      {
        status: 'active',
        lastActivityAt: { $lt: yesterday }
      },
      {
        $set: { status: 'abandoned', completedAt: new Date() }
      }
    );

    if (abandonedWaiting.modifiedCount > 0 || abandonedActive.modifiedCount > 0) {
      console.log(`[Cleanup] Marked ${abandonedWaiting.modifiedCount} waiting and ${abandonedActive.modifiedCount} active debates as abandoned`);

      if (io) {
        io.emit('debates:cleanup', {
          abandonedWaiting: abandonedWaiting.modifiedCount,
          abandonedActive: abandonedActive.modifiedCount
        });
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up debates:', error);
  }
}

function startCleanupJob(io, intervalMinutes = 5) {
  console.log(`[Cleanup] Starting debate cleanup job (runs every ${intervalMinutes} minutes)`);

  // Run immediately on start
  cleanupStaleDebates(io);

  // Then run periodically
  const intervalMs = intervalMinutes * 60 * 1000;
  const job = setInterval(() => cleanupStaleDebates(io), intervalMs);

  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    clearInterval(job);
  });

  return job;
}

module.exports = { cleanupStaleDebates, startCleanupJob };
