// src/routes/sales.js
const router = require('express').Router();
const ctrl = require('../controllers/salesController');

router.get('/', ctrl.getAllSales);
router.get('/:id', ctrl.getSale);
router.post('/', ctrl.createSale);

module.exports = router;
