// src/routes/products.js
const router = require('express').Router();
const ctrl = require('../controllers/productsController');

router.get('/low-stock', ctrl.getLowStock);
router.get('/', ctrl.getAllProducts);
router.get('/:id', ctrl.getProduct);
router.post('/', ctrl.createProduct);
router.put('/:id', ctrl.updateProduct);

module.exports = router;
