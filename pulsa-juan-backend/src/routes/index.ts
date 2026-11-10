import { Router } from 'express';

import adminRoutes from './admin.routes';
import agentRoutes from './agent.routes';
import { getBon } from '../controller/bon.controller';
import { otomaxReport, postCallback } from '../controller/fulfillment.controller';

const router = Router();
router.get('/health', (_req, res) => res.json({ ok: true }));
router.get('/bon/:token', getBon);
router.use('/agent', agentRoutes);
router.use('/admin', adminRoutes);
router.post('/fulfillment/callback/:provider', postCallback);
router.get('/fulfillment/otomax/report', otomaxReport);
router.post('/fulfillment/otomax/report', otomaxReport);

export default router;
