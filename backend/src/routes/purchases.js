// src/routes/purchases.js
const router = require('express').Router();
const ctrl = require('../controllers/purchasesController');

router.get('/', ctrl.getAllPurchases);
router.get('/:id', ctrl.getPurchase);
router.post('/', ctrl.createPurchase);
router.post('/:id/pay', ctrl.recordPayment);

module.exports = router;
