const { Router } = require('express');
const adminDashboardController = require('../controllers/adminDashboardController');
const { requireSession, requireAdmin } = require('../middlewares/authSession');

const router = Router();

router.use(requireSession, requireAdmin);
router.get('/overview', adminDashboardController.getOverview);
router.get('/users', adminDashboardController.getUsers);
router.get('/pending-cases', adminDashboardController.getPendingCases);
router.get('/pending-registrations', adminDashboardController.getPendingRegistrationRequests);
router.post('/pending-registrations/:userId/approve', adminDashboardController.approveRegistrationRequest);

module.exports = router;
