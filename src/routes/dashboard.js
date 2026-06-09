const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboardController');

router.get('/overview', controller.getOverview);
router.get('/expiring', controller.getExpiringList);
router.get('/workload', controller.getOwnerWorkload);
router.get('/timeline', controller.getTimeline);

module.exports = router;
