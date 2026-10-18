import 'dotenv/config';
import http from 'http';
import cron from 'node-cron';

import app from './app';
import { expireStaleTopUps } from './service/topup.service';

const port = Number(process.env.PORT || 3030);
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`pulsa-juan backend listening on :${port}`);
});

// Registered here (not in app.ts) so tests importing the app never start it.
cron.schedule('*/15 * * * *', () => {
  expireStaleTopUps().catch((error) => console.error('expireStaleTopUps failed', error));
});
