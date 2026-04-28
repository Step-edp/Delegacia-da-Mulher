const { Router } = require('express');
const adminDashboardController = require('../controllers/adminDashboardController');
const { requireSession, requireAdmin } = require('../middlewares/authSession');

const router = Router();

router.use(requireSession, requireAdmin);
router.get('/overview', adminDashboardController.getOverview);
router.get('/agenda-calendar', adminDashboardController.getAgendaCalendar);
router.get('/agenda-availability', adminDashboardController.getAgendaAvailability);
router.post('/agenda-availability', adminDashboardController.createAgendaAvailability);
router.get('/agenda-settings', adminDashboardController.getAgendaSettings);
router.put('/agenda-settings', adminDashboardController.updateAgendaSettings);
router.get('/import-history', adminDashboardController.getImportHistory);
router.get('/involved-people', adminDashboardController.getInvolvedPeople);
router.get('/users', adminDashboardController.getUsers);
router.get('/notifications', adminDashboardController.getNotifications);
router.delete('/users/:userId', adminDashboardController.deleteUser);
router.get('/pending-cases', adminDashboardController.getPendingCases);
router.get('/processing-cases', adminDashboardController.getProcessingCases);
router.get('/download-file/:fileName', adminDashboardController.downloadImportedFile);
router.post('/pending-cases/:expectedCaseId/indict', adminDashboardController.indictPendingCase);
router.get('/pending-registrations', adminDashboardController.getPendingRegistrationRequests);
router.post('/pending-registrations/:userId/approve', adminDashboardController.approveRegistrationRequest);

module.exports = router;
