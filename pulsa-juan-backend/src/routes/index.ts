import { Router } from 'express';

import adminRoutes from './admin.routes';
import agentRoutes from './agent.routes';

const router = Router();
router.get('/health', (_req, res) => res.json({ ok: true }));
router.use('/agent', agentRoutes);
router.use('/admin', adminRoutes);

export default router;
