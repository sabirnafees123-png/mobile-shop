// src/routes/purchases.js
const router = require('express').Router();
const ctrl   = require('../controllers/purchasesController');
const checkRegisterLock = require('../middleware/checkRegisterLock');

router.get('/',        ctrl.getAllPurchases);
router.get('/:id',     ctrl.getPurchase);
router.post('/',       checkRegisterLock, ctrl.createPurchase);
router.post('/:id/pay', checkRegisterLock, ctrl.recordPayment);

module.exports = router;
