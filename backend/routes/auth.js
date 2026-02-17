const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Debate = require('../models/Debate');
const authenticate = require('../middleware/auth');
const { uniqueNamesGenerator, adjectives, animals } = require('unique-names-generator');
const { guestLoginLimiter } = require('../middleware/rateLimiter');

// Login (no auth required)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('[Auth] Login attempt:', username);

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      console.log('[Auth] User not found:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('[Auth] Invalid password for user:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('[Auth] Login successful:', username, 'Role:', user.role);

    res.json({
      token,
      user: {
        userId: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/guest-login', guestLoginLimiter, async (req, res) => {
  try {

    // ✅ Step 2: Generate unique guest username with retry
    let guestUsername;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      guestUsername = uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: '',
        length: 2,
        style: 'capital'
      });

      const existingUser = await User.findOne({ username: guestUsername });
      if (!existingUser) {
        break; // ✅ Username is unique
      }

      attempts++;
      console.log(`[Guest] Username ${guestUsername} taken, attempt ${attempts}/${maxAttempts}`);
    }

    // Fallback to timestamp if collision persists
    if (attempts === maxAttempts) {
      const timestamp = Date.now();
      guestUsername = `Guest${timestamp}`;
      console.log(`[Guest] Using fallback username: ${guestUsername}`);
    }

    // ✅ Step 3: Create guest user WITHOUT password
    const guestUser = new User({
      username: guestUsername,
      // ❌ DO NOT SET passwordHash for guests
      role: 'participant',
      isGuest: true,
      lastLogin: new Date()
    });

    await guestUser.save();
    console.log(`[Guest] ✅ Created new guest: ${guestUsername} (${guestUser._id})`);

    // ✅ Step 4: Generate JWT token
    const token = jwt.sign(
      { userId: guestUser._id, username: guestUser.username, role: guestUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Guest login successful',
      token,
      user: {
        userId: guestUser._id,
        username: guestUser.username,
        role: guestUser.role,
        isGuest: true
      },
      activeDebate: null
    });

  } catch (error) {
    console.error('[Guest] ❌ Error:', error);

    // ✅ Better error handling
    if (error.code === 11000) {
      // Duplicate username - retry once with timestamp
      return res.status(409).json({
        message: 'Username collision, please try again',
        error: 'duplicate_username'
      });
    }

    res.status(500).json({
      message: 'Server error during guest login',
      error: error.message
    });
  }
});

router.post('/guest-resume', async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // ✅ Find SPECIFIC guest by username
    const guestUser = await User.findOne({
      username: username.trim(),
      isGuest: true
    });

    if (!guestUser) {
      return res.status(404).json({
        message: 'Guest session not found'
      });
    }

    // Generate new token for this specific user
    const token = jwt.sign(
      { userId: guestUser._id, username: guestUser.username, role: guestUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    guestUser.lastLogin = new Date();
    await guestUser.save();

    res.json({
      message: 'Session resumed',
      token,
      user: {
        userId: guestUser._id,
        username: guestUser.username,
        role: guestUser.role,
        isGuest: true
      }
    });

  } catch (error) {
    console.error('[Guest Resume] Error:', error);
    res.status(500).json({ message: 'Failed to resume session' });
  }
});

// Backend: routes/auth.js
router.get('/guest-list-recent', async (req, res) => {
  try {
    // ✅ Only show guests active in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentGuests = await User.find({
      isGuest: true,
      lastLogin: { $gte: sevenDaysAgo }
    })
    .select('username lastLogin') // Only return username and lastLogin
    .sort({ lastLogin: -1 }) // Most recent first
    .limit(20); // Limit to 20 for performance

    res.json({
      guests: recentGuests.map(g => ({
        username: g.username,
        lastSeen: g.lastLogin
      }))
    });

  } catch (error) {
    console.error('[Guest List] Error:', error);
    res.status(500).json({ message: 'Failed to fetch guest list' });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ✅ If guest, check for debates
    if (user.isGuest) {
      const debates = await Debate.find({
        $or: [
          { player1UserId: userId },
          { player2UserId: userId }
        ]
      });

      const hasCompletedDebate = debates.some(d => d.status === 'completed');
      const hasActiveDebate = debates.some(d => d.status === 'active');
      const hasNoDebates = debates.length === 0;

      // Delete if no debates at all
      if (hasNoDebates) {
        await User.findByIdAndDelete(userId);
        console.log(`[Logout] Deleted unused guest: ${user.username}`);
        return res.json({
          message: 'Guest account deleted (no debates)',
          deleted: true
        });
      }

      // Keep if completed or active debate exists
      console.log(`[Logout] Keeping guest ${user.username} (has debates)`);
      return res.json({
        message: 'Logout successful',
        deleted: false
      });
    }

    // Regular user logout (no deletion)
    res.json({ message: 'Logout successful', deleted: false });
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register/Create User (Admin only)
router.post('/register', authenticate, async (req, res) => {
  try {
    console.log('[Auth] Register request from user:', req.user);
    console.log('[Auth] Request body:', req.body);

    // Only admins can create users
    if (req.user.role !== 'admin') {
      console.log('[Auth] Non-admin tried to create user:', req.user.username);
      return res.status(403).json({ message: 'Only admin can create users' });
    }

    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    console.log('[Auth] Creating user:', username, 'Role:', role);

    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('[Auth] Username already exists:', username);
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Create new user
    const user = new User({
      username,
      password,
      role: role || 'participant'
    });

    await user.save();

    console.log('[Auth] ✅ User created successfully:', username);

    res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[Auth] ❌ Register error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all users (Admin only)
router.get('/users', authenticate, async (req, res) => {
  try {
    console.log('[Auth] Fetching users, requested by:', req.user.username);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can view users' });
    }

    const users = await User.find().select('-password').sort({ createdAt: -1 });

    console.log('[Auth] Found', users.length, 'users');

    res.json({ users });
  } catch (error) {
    console.error('[Auth] Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user (Admin only)
router.delete('/users/:userId', authenticate, async (req, res) => {
  try {
    console.log('[Auth] Delete user request:', req.params.userId);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can delete users' });
    }

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    await User.findByIdAndDelete(req.params.userId);

    console.log('[Auth] ✅ User deleted:', user.username);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Auth] Error deleting user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
