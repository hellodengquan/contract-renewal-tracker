const express = require('express');
const router = express.Router();
const controller = require('../controllers/contractController');
const { validateContract, validatePagination } = require('../middleware/validator');

router.get('/', validatePagination, controller.getContractList);
router.get('/stats', controller.getContractStats);
router.get('/owners', controller.getOwners);
router.get('/types', controller.getContractTypes);
router.get('/:id', controller.getContractById);
router.post('/', validateContract, controller.createContract);
router.put('/:id', validateContract, controller.updateContract);
router.delete('/:id', controller.deleteContract);

module.exports = router;
