const express = require('express');
const router = express.Router();
const controller = require('../controllers/reminderController');
const { validatePagination } = require('../middleware/validator');

router.get('/', validatePagination, controller.getReminderList);
router.get('/upcoming', controller.getUpcomingReminders);
router.get('/:id', controller.getReminderById);
router.post('/', controller.createReminder);
router.put('/:id', controller.updateReminder);
router.patch('/:id/status', controller.markReminderStatus);
router.delete('/:id', controller.deleteReminder);

module.exports = router;
