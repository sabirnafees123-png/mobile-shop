// src/routes/products.js  — add serial search endpoint
const router = require('express').Router();
const ctrl   = require('../controllers/productsController');

router.get('/',                    ctrl.getProducts);
router.get('/categories',          ctrl.getCategories);
router.get('/serial/:serial',      ctrl.getProductBySerial);
router.get('/:id',                 ctrl.getProductById);
router.post('/',                   ctrl.createProduct);
router.put('/:id',                 ctrl.updateProduct);
router.delete('/:id',              ctrl.deleteProduct);

module.exports = router;
