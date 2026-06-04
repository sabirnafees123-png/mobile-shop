// src/routes/sales.js
const router = require('express').Router();
const ctrl   = require('../controllers/salesController');
const checkRegisterLock = require('../middleware/checkRegisterLock');

router.get('/',                   ctrl.getAllSales);
router.get('/search-serial',      ctrl.searchBySerial);
router.get('/:id',                ctrl.getSale);
router.post('/',                  checkRegisterLock, ctrl.createSale);
router.post('/:id/return',        checkRegisterLock, ctrl.returnSale);
router.post('/:id/mark-received', checkRegisterLock, ctrl.markPaymentReceived);

module.exports = router;
