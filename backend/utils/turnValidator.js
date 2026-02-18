/**
 * Debate Turn Logic Validator
 * Ensures turn state remains consistent and prevents logic loss
 */

/**
 * Validates that a debate has consistent turn state
 * @param {Object} debate - The debate document
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateTurnState(debate) {
  const errors = [];

  if (!debate) {
    errors.push('Debate is null or undefined');
    return { isValid: false, errors };
  }

  // If debate is waiting, nextTurn shouldn't be set yet
  if (debate.status === 'waiting') {
    // nextTurn should be null for waiting debates
    if (debate.nextTurn !== null && debate.nextTurn !== undefined) {
      errors.push(`Waiting debate should not have nextTurn set (found: ${debate.nextTurn})`);
    }
    return { isValid: errors.length === 0, errors };
  }

  // If debate is active or completed, turn logic must be set
  if (debate.status === 'active' || debate.status === 'completed') {
    // firstPlayer must be set
    if (!debate.firstPlayer) {
      errors.push(`Active/completed debate must have firstPlayer set`);
    }

    // If no arguments yet, nextTurn should equal firstPlayer
    const currentRoundArgs = (debate.arguments || []).filter(
      arg => arg.round === debate.currentRound
    );

    if (currentRoundArgs.length === 0) {
      if (debate.nextTurn !== debate.firstPlayer) {
        errors.push(
          `Debate has no arguments yet: nextTurn should be ${debate.firstPlayer}, got ${debate.nextTurn}`
        );
      }
    } else if (currentRoundArgs.length === 1) {
      // After first argument, nextTurn should be opposite stance
      const oppositeStance =
        currentRoundArgs[0].stance === 'for' ? 'against' : 'for';
      if (debate.nextTurn !== oppositeStance) {
        errors.push(
          `Debate has 1 argument: nextTurn should be ${oppositeStance}, got ${debate.nextTurn}`
        );
      }
    } else if (currentRoundArgs.length === 2) {
      // After both arguments, nextTurn should be null (awaiting belief check)
      if (debate.nextTurn !== null && debate.nextTurn !== undefined) {
        errors.push(
          `Debate has 2 arguments for round: nextTurn should be null, got ${debate.nextTurn}`
        );
      }
    } else if (currentRoundArgs.length > 2) {
      errors.push(`Debate has more than 2 arguments in round ${debate.currentRound}`);
    }
  }

  // If debate is abandoned, nextTurn should be null
  if (debate.status === 'abandoned') {
    if (debate.nextTurn !== null && debate.nextTurn !== undefined) {
      errors.push(`Abandoned debate should have nextTurn=null, got ${debate.nextTurn}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculates what the nextTurn should be for a debate
 * Useful for fixing turn state issues
 * @param {Object} debate - The debate document
 * @returns {string|null} Expected nextTurn value
 */
function calculateExpectedNextTurn(debate) {
  if (!debate || debate.status === 'waiting' || debate.status === 'abandoned') {
    return null;
  }

  const currentRoundArgs = (debate.arguments || []).filter(
    arg => arg.round === debate.currentRound
  );

  if (currentRoundArgs.length === 0) {
    return debate.firstPlayer;
  }

  if (currentRoundArgs.length === 1) {
    return currentRoundArgs[0].stance === 'for' ? 'against' : 'for';
  }

  // currentRoundArgs.length >= 2
  return null;
}

/**
 * Automatically fixes turn state if it's inconsistent
 * @param {Object} debate - The debate document (will be modified in place)
 * @returns {boolean} True if changes were made
 */
function autoFixTurnState(debate) {
  if (!debate) return false;

  const expected = calculateExpectedNextTurn(debate);
  if (debate.nextTurn !== expected) {
    console.warn(
      `[TurnValidator] Auto-fixing turn state for debate ${debate._id}: ` +
        `${debate.nextTurn} => ${expected}`
    );
    debate.nextTurn = expected;
    return true;
  }

  return false;
}

/**
 * Logs a detailed turn state report for debugging
 * @param {Object} debate - The debate document
 */
function logTurnStateReport(debate) {
  if (!debate) return;

  const currentRoundArgs = (debate.arguments || []).filter(
    arg => arg.round === debate.currentRound
  );
  const expected = calculateExpectedNextTurn(debate);
  const validation = validateTurnState(debate);

  console.log('[TurnValidator] Turn State Report:', {
    debateId: debate._id,
    status: debate.status,
    currentRound: debate.currentRound,
    firstPlayer: debate.firstPlayer,
    nextTurn: debate.nextTurn,
    expectedNextTurn: expected,
    currentRoundArgCount: currentRoundArgs.length,
    isValid: validation.isValid,
    errors: validation.errors.length > 0 ? validation.errors : 'None'
  });
}

/**
 * Safely saves a debate and validates turn state after save
 * Logs errors but does not throw - allows operation to continue with warnings
 * @param {Object} debate - The debate document to save
 * @param {string} context - Where the save is being called from (for logging)
 * @returns {Promise<Object>} The saved debate document
 */
async function saveWithValidation(debate, context = 'unknown') {
  try {
    await debate.save();

    // Verify turn state after save
    const validation = validateTurnState(debate);
    if (!validation.isValid) {
      console.warn(`[TurnValidator] Post-save validation failed in ${context}:`, {
        debateId: debate._id,
        errors: validation.errors
      });
      logTurnStateReport(debate);
    }

    return debate;
  } catch (error) {
    console.error(`[TurnValidator] Error saving debate in ${context}:`, {
      debateId: debate._id,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  validateTurnState,
  calculateExpectedNextTurn,
  autoFixTurnState,
  logTurnStateReport,
  saveWithValidation
};
