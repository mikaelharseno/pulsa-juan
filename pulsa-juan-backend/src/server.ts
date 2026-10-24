import 'dotenv/config';
import http from 'http';
import cron from 'node-cron';

import app from './app';
import { expireStaleTopUps } from './service/topup.service';
import { alertStuckOrders } from './service/transaction.service';

const port = Number(process.env.PORT || 3030);
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`pulsa-juan backend listening on :${port}`);
});

// Registered here (not in app.ts) so tests importing the app never start it.
cron.schedule('*/15 * * * *', () => {
  expireStaleTopUps().catch((error) => console.error('expireStaleTopUps failed', error));
});

cron.schedule('*/5 * * * *', () => {
  alertStuckOrders().catch((error) => console.error('alertStuckOrders failed', error));
});
