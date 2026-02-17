const mongoose = require('mongoose');
const Debate = require('../models/Debate');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

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

async function backfillNextTurn() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const debates = await Debate.find({ status: 'active' });
    console.log(`Found ${debates.length} active debates`);

    let updated = 0;

    for (const debate of debates) {
      if (!debate.firstPlayer) {
        console.error('[Backfill] Missing firstPlayer', { debateId: debate._id.toString() });
        continue;
      }

      const expectedNextTurn = getExpectedNextTurn(debate);
      if (debate.nextTurn !== expectedNextTurn) {
        console.log('[Backfill] Updating nextTurn', {
          debateId: debate._id.toString(),
          currentRound: debate.currentRound,
          nextTurn: debate.nextTurn,
          expectedNextTurn
        });
        debate.nextTurn = expectedNextTurn;
        await debate.save();
        updated += 1;
      }
    }

    console.log(`Backfill complete. Updated ${updated} debates.`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfillNextTurn();
