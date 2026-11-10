import { Request, Response } from 'express';

import { asyncHandler } from '../lib/errors';
import { bonData, renderBonPdf } from '../service/bon.service';

/** Public: GET /api/bon/:token → the customer's PDF bon (?download=1 saves it). */
export const getBon = asyncHandler(async (req: Request, res: Response) => {
  const data = await bonData(req.params.token);
  const pdf = await renderBonPdf(data);
  const name = `bon-${data.trxNumber}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(pdf);
});
