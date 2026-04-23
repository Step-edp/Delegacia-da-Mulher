const { Router } = require('express');

const healthRoutes = require('./healthRoutes');
const reportRoutes = require('./reportRoutes');
const pdfRoutes = require('./pdfRoutes');
const personRoutes = require('./personRoutes');
const summonsRoutes = require('./summonsRoutes');
const authRoutes = require('./authRoutes');
const schedulingRoutes = require('./schedulingRoutes');
const adminDashboardRoutes = require('./adminDashboardRoutes');
const summonsEventsRoutes = require('./summonsEventsRoutes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/reports', reportRoutes);
router.use('/pdfs', pdfRoutes);
router.use('/persons', personRoutes);
router.use('/summons', summonsRoutes);
router.use('/auth', authRoutes);
router.use('/scheduling', schedulingRoutes);
router.use('/admin/dashboard', adminDashboardRoutes);
router.use('/summons-events', summonsEventsRoutes);

module.exports = router;
