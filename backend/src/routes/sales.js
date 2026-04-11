// src/routes/sales.js
const router = require('express').Router();
const ctrl   = require('../controllers/salesController');

router.get('/',                   ctrl.getAllSales);
router.get('/search-serial',      ctrl.searchBySerial);
router.get('/:id',                ctrl.getSale);
router.post('/',                  ctrl.createSale);
router.post('/:id/return',        ctrl.returnSale);
router.post('/:id/mark-received', ctrl.markPaymentReceived);

module.exports = router;
