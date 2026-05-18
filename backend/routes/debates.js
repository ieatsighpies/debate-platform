/**
 * Main Debates Router
 *
 * Entry point for all debate-related routes.
 * Mounts sub-routers by concern:
 * - Core debate operations (join, create, list, analytics)
 * - Argument submission
 * - Belief updates and reflections
 * - Survey submission
 * - Early end voting
 * - Admin operations (trigger AI, end debate, control AI)
 *
 * Also exports AI-related utilities needed by controllers and services.
 */

const express = require('express');
const router = express.Router();

// Import sub-routers
const debateRoutes = require('./debateRoutes');
const argumentRoutes = require('./argumentRoutes');
const beliefRoutes = require('./beliefRoutes');
const surveyRoutes = require('./surveyRoutes');
const adminRoutes = require('./adminRoutes');
const earlyEndRoutes = require('./earlyEndRoutes');

// Import AI debate service (for AI-related exports)
const { triggerAIResponse, cleanupAllAITimeouts } = require('../services/aiDebateService');

// ============================================
// MOUNT SUB-ROUTERS
// ============================================

// Core debate operations
router.use('/', debateRoutes);

// Argument submission
router.use('/', argumentRoutes);

// Belief and reflection
router.use('/', beliefRoutes);

// Survey submission
router.use('/', surveyRoutes);

// Early end voting
router.use('/', earlyEndRoutes);

// Admin operations
router.use('/', adminRoutes);

// ============================================
// EXPORTS
// ============================================

module.exports = router;
module.exports.triggerAIResponse = triggerAIResponse;
module.exports.cleanupAllAITimeouts = cleanupAllAITimeouts;
