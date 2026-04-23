const { Router } = require('express');
const summonsEventsController = require('../controllers/summonsEventsController');
const { requireSession, requireAdmin } = require('../middlewares/authSession');

const router = Router();

// Rotas públicas (chamadas da página de atendimento da vítima via token)
router.post('/:summonsId/link-clicked', summonsEventsController.recordLinkClicked);
router.post('/:summonsId/schedule-button-clicked', summonsEventsController.recordScheduleButtonClicked);
router.post('/:summonsId/refusal', summonsEventsController.recordRefusal);
router.post('/:summonsId/scheduled', summonsEventsController.recordScheduled);

// Rotas admin
router.get('/history/case/:caseId', requireSession, requireAdmin, summonsEventsController.getHistoryByCaseId);
router.get('/certificate/case/:caseId', requireSession, requireAdmin, summonsEventsController.downloadCertificate);
router.get('/history/by-bo', requireSession, requireAdmin, summonsEventsController.getHistoryByBoNumber);
router.get('/certificate/by-bo', requireSession, requireAdmin, summonsEventsController.downloadCertificateByBo);

module.exports = router;
