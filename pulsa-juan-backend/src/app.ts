import express, { Application, Request, Response } from 'express';
import fileUpload from 'express-fileupload';
import { IncomingMessage } from 'http';

import { errorMiddleware } from './lib/errors';
import routes from './routes';
import { LOCAL_UPLOADS_DIR } from './service/upload.service';

const app: Application = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'PUT, POST, PATCH, DELETE, GET');
    return res.status(200).json({});
  }
  next();
});

app.use(
  express.json({
    // media type only — proxies append "; charset=utf-8"
    type: (req: IncomingMessage) => {
      const contentType = req.headers['content-type'];
      return contentType === undefined || contentType.split(';')[0].trim().toLowerCase() === 'application/json';
    },
    limit: '5mb',
    verify: (req, _res, buf) => {
      (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'pulsa-juan API is running on /api' });
});

app.use('/uploads', express.static(LOCAL_UPLOADS_DIR, { maxAge: '365d', immutable: true }));
app.use('/api', routes);
app.use(errorMiddleware);

export default app;
