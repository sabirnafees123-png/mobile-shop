const express = require('express');
const router = express.Router();
const {
  getProducts, getProductById, createProduct,
  updateProduct, deleteProduct, getCategories
} = require('../controllers/productsController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// All routes require JWT
router.use(verifyToken);

router.get('/',           getProducts);
router.get('/categories', getCategories);
router.get('/:id',        getProductById);

// Only Admin & Accountant can create/edit/delete
router.post('/',    authorizeRoles('admin', 'accountant'), createProduct);
router.put('/:id',  authorizeRoles('admin', 'accountant'), updateProduct);
router.delete('/:id', authorizeRoles('admin'),             deleteProduct);

module.exports = router;