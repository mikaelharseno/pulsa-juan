import { Router } from 'express';

import * as c from '../controller/admin.controller';
import { authenticateAdmin, requireRole } from '../middleware/authenticateAdmin';

const router = Router();

router.post('/login', c.postLogin);
router.use(authenticateAdmin);
router.get('/me', c.getMe);

router.get('/topups', c.getTopUps);
router.put('/topups/:id', c.putTopUp);

router.get('/transactions', c.getTransactions);
router.put('/transactions/:id', c.putTransaction);

router.get('/agents', c.getAgents);
router.get('/agents/:id', c.getAgent);
router.put('/agents/:id', requireRole('OWNER', 'ADMIN'), c.putAgent);
router.post('/agents/:id/adjust-saldo', requireRole('OWNER', 'ADMIN'), c.postAdjustSaldo);
router.post('/agents/:id/hutang-payment', requireRole('OWNER'), c.postHutangPayment);
router.post('/agents/:id/transfer-commission-id', requireRole('OWNER'), c.postTransferCommissionId);

router.get('/mitra-connections', c.getConnections);
router.put('/mitra-connections/:id', requireRole('OWNER'), c.putConnection);
router.get('/commissions', c.getCommissions);

router.get('/segments', c.getSegments);
router.post('/segments', requireRole('OWNER', 'ADMIN'), c.postSegment);
router.put('/segments/reorder', requireRole('OWNER', 'ADMIN'), c.putSegmentsReorder);
router.get('/segments/:id', c.getSegment);
router.put('/segments/:id', requireRole('OWNER', 'ADMIN'), c.putSegment);
router.delete('/segments/:id', requireRole('OWNER'), c.deleteSegment);
router.put('/segments/:id/draft', requireRole('OWNER', 'ADMIN'), c.putSegmentDraft);
router.post('/segments/:id/validate', c.postSegmentValidate);
router.post('/segments/:id/publish', requireRole('OWNER', 'ADMIN'), c.postSegmentPublish);
router.post('/segments/:id/duplicate', requireRole('OWNER', 'ADMIN'), c.postSegmentDuplicate);
router.get('/segments/:id/versions', c.getSegmentVersions);
router.post('/segments/:id/restore', requireRole('OWNER', 'ADMIN'), c.postSegmentRestore);
router.post('/segments/:id/discard-draft', requireRole('OWNER', 'ADMIN'), c.postSegmentDiscardDraft);

router.get('/packages', c.getPackages);
router.get('/packages/categories', c.getPackageCategories);
router.post('/packages', requireRole('OWNER', 'ADMIN'), c.postPackage);
router.post('/packages/import', requireRole('OWNER', 'ADMIN'), c.postPackagesImport);
router.put('/packages/:id', requireRole('OWNER', 'ADMIN'), c.putPackage);
router.delete('/packages/:id', requireRole('OWNER'), c.deletePackage);

router.get('/provider-prefixes', c.getPrefixes);
router.post('/provider-prefixes', requireRole('OWNER', 'ADMIN'), c.postPrefix);
router.delete('/provider-prefixes/:id', requireRole('OWNER', 'ADMIN'), c.deletePrefixHandler);

router.get('/config', c.getConfigHandler);
router.put('/config', requireRole('OWNER', 'ADMIN'), c.putConfigHandler);
router.post('/uploads', c.postUpload);

export default router;
