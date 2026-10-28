import { Router } from 'express';

import * as c from '../controller/agent.controller';
import { authenticateAgent } from '../middleware/authenticateAgent';

const router = Router();

router.post('/auth/register', c.postRegister);
router.post('/auth/login', c.postLogin);
router.post('/auth/google', c.postGoogle);
router.post('/auth/otp/request', c.postOtpRequest);
router.post('/auth/otp/verify', c.postOtpVerify);
router.post('/auth/login/pin', c.postPinLogin);
router.post('/auth/pin/reset', c.postPinReset);
router.get('/config', c.getAgentConfig);

router.use(authenticateAgent);

router.get('/me', c.getMe);
router.put('/me', c.putMe);
router.put('/me/pin', c.putPin);
router.get('/ledger', c.getLedger);
router.get('/home', c.getHome);
router.get('/segments/:id/tree', c.getSegmentTree);
router.post('/inquiries', c.postInquiry);
router.get('/inquiries/:id', c.getInquiry);

router.post('/topups', c.postTopUp);
router.get('/topups', c.getTopUps);
router.get('/topups/:id', c.getTopUp);
router.put('/topups/:id/bank', c.putTopUpBank);
router.post('/topups/:id/claim', c.postTopUpClaim);

router.post('/transactions', c.postTransaction);
router.get('/transactions', c.getTransactions);
router.get('/transactions/:id', c.getTransaction);
router.put('/transactions/:id/sell-price', c.putTransactionSellPrice);
router.get('/rekap', c.getRekap);
router.get('/sell-margins', c.getSellMargins);
router.put('/sell-margins', c.putSellMargins);

router.get('/commissions', c.getCommissions);
router.post('/commissions/claim', c.postClaimCommissions);
router.get('/mitra', c.getMitra);

export default router;
