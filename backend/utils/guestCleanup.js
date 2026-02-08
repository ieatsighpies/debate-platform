// utils/guestCleanup.js
const User = require('../models/User');
const Debate = require('../models/Debate');

async function cleanupStaleGuests() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find guests with no active debates and older than 30 days
    const staleGuests = await User.find({
      isGuest: true,
      lastLogin: { $lt: thirtyDaysAgo }
    });

    for (const guest of staleGuests) {
      const hasDebates = await Debate.findOne({
        $or: [
          { player1UserId: guest._id },
          { player2UserId: guest._id }
        ],
        status: { $in: ['active', 'waiting'] }
      });

      if (!hasDebates) {
        await User.findByIdAndDelete(guest._id);
        console.log(`[Cleanup] Deleted stale guest: ${guest.username}`);
      }
    }

    console.log(`[Cleanup] ✅ Cleaned up ${staleGuests.length} stale guest accounts`);
  } catch (error) {
    console.error('[Cleanup] Error:', error);
  }
}

module.exports = { cleanupStaleGuests };