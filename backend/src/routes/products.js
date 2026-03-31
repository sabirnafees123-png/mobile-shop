const express = require('express');
const router = express.Router();
const {
  getProducts, getProductById, createProduct,
  updateProduct, deleteProduct, getCategories
} = require('../controllers/productsController');

// No role middleware — just use protect from server.js (already applied)
router.get('/',           getProducts);
router.get('/categories', getCategories);
router.get('/:id',        getProductById);
router.post('/',          createProduct);
router.put('/:id',        updateProduct);
router.delete('/:id',     deleteProduct);

module.exports = router;
