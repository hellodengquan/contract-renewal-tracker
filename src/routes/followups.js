const express = require('express');
const router = express.Router();
const controller = require('../controllers/followUpController');
const { validateFollowUp, validatePagination } = require('../middleware/validator');

router.get('/', validatePagination, controller.getFollowUpList);
router.get('/pending', controller.getPendingFollowUps);
router.get('/:id', controller.getFollowUpById);
router.post('/', validateFollowUp, controller.createFollowUp);
router.put('/:id', validateFollowUp, controller.updateFollowUp);
router.delete('/:id', controller.deleteFollowUp);

module.exports = router;
