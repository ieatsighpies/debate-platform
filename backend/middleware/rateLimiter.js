const rateLimit = require('express-rate-limit');

const guestLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 guest accounts per IP per window
  message: 'Too many guest accounts created from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { guestLoginLimiter };