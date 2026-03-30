const express = require('express');
const router = express.Router();
const { register, login, getMe, changePassword } = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public routes (no token needed)
router.post('/login', login);

// Admin only: register new users
router.post('/register', protect, adminOnly, register);

// Protected routes
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);

module.exports = router;