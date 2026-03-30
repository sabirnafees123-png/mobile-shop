// src/routes/dashboard.js
const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');

router.get('/summary', ctrl.getSummary);

module.exports = router;
