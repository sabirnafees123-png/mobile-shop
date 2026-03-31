const express = require('express');
const router = express.Router();
const {
  getInventory, getInventoryByProduct, adjustStock,
  updateMinStock, getMovements, getInventoryStats
} = require('../controllers/inventoryController');

router.get('/',                    getInventory);
router.get('/stats',               getInventoryStats);
router.get('/movements',           getMovements);
router.get('/:productId',          getInventoryByProduct);
router.post('/adjust',             adjustStock);
router.put('/settings',            updateMinStock);

module.exports = router;