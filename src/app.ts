import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './utils/logger';
import { webhookRouter } from './routes/webhook.routes';
import { reelsRouter } from './routes/reels.routes';
import { templatesRouter } from './routes/templates.routes';
import { logsRouter } from './routes/logs.routes';
import { flowsRouter } from './routes/flows.routes';
import { replyRouter } from './routes/reply.routes';
import cors from "cors"

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));

  app.use(cors({ origin: "*" }))

  // Capture the raw body so the webhook signature middleware can HMAC the exact
  // bytes Meta signed. Applied globally; harmless for the JSON API routes.
  app.use(
    express.json({
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/webhooks', webhookRouter);
  app.use('/reels', reelsRouter);
  app.use('/templates', templatesRouter);
  app.use('/logs', logsRouter);
  app.use('/flows', flowsRouter);
  app.use('/reply', replyRouter);

  // 404 fallback.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler — nothing should crash the process.
  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    req.log?.error({ err }, 'Unhandled route error');
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
