// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const {
  register, login, getMe, changePassword,
  getUsers, updateUser, resetPassword
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public
router.post('/login', login);

// Admin only
router.post('/register',                    protect, adminOnly, register);
router.get('/users',                        protect, adminOnly, getUsers);
router.put('/users/:id',                    protect, adminOnly, updateUser);
router.post('/users/:id/reset-password',    protect, adminOnly, resetPassword);

// Protected
router.get('/me',              protect, getMe);
router.post('/change-password', protect, changePassword);

module.exports = router;
