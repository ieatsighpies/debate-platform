const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Debate = require('../models/Debate');
const authenticate = require('../middleware/auth');
const bcrypt = require('bcrypt');
const { uniqueNamesGenerator, adjectives, animals, colors } = require('unique-names-generator');

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

router.post('/guest-login', async (req, res) => {
  try {
    // Check for existing guest with active debate (keep your existing logic)
    const guestUsers = await User.find({ isGuest: true });

    for (const guest of guestUsers) {
      const activeDebate = await Debate.findOne({
        $or: [
          { player1UserId: guest._id },
          { player2UserId: guest._id }
        ],
        status: 'active'
      });

      if (activeDebate) {
        const token = jwt.sign(
          { userId: guest._id, username: guest.username, role: guest.role },
          process.env.JWT_SECRET,
          { expiresIn: '1d' }
        );

        return res.json({
          message: 'Resuming guest session',
          token,
          user: {
            userId: guest._id,
            username: guest.username,
            role: guest.role
          },
          activeDebate: activeDebate._id
        });
      }
    }

    // ✅ Generate unique guest name with retry logic
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

      // Check if username already exists
      const existingUser = await User.findOne({ username: guestUsername });
      if (!existingUser) {
        break; // Username is unique
      }

      attempts++;
      console.log(`[Guest] Username ${guestUsername} taken, retrying...`);
    }

    // Fallback to timestamp if all attempts fail
    if (attempts === maxAttempts) {
      guestUsername = `Guest_${Date.now()}`;
    }

    const guestUser = new User({
      username: guestUsername,
      passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
      role: 'participant',
      isGuest: true
    });

    await guestUser.save();
    console.log(`[Guest] Created new guest: ${guestUsername}`);

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
        role: guestUser.role
      },
      activeDebate: null
    });
  } catch (error) {
    console.error('[Guest] Error:', error);
    res.status(500).json({ message: 'Server error during guest login', error: error.message });
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
