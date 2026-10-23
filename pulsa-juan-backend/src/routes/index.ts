import { Router } from 'express';

import adminRoutes from './admin.routes';
import agentRoutes from './agent.routes';
import { postCallback } from '../controller/fulfillment.controller';

const router = Router();
router.get('/health', (_req, res) => res.json({ ok: true }));
router.use('/agent', agentRoutes);
router.use('/admin', adminRoutes);
router.post('/fulfillment/callback/:provider', postCallback);

export default router;
