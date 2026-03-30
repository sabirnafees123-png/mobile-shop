// src/routes/suppliers.js
const router = require('express').Router();
const ctrl = require('../controllers/suppliersController');

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;
