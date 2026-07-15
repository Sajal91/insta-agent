import path from 'node:path';
import fs from 'node:fs';
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from 'express';
import { pinoHttp } from 'pino-http';
import cors from 'cors';
import { config } from './config/env';
import { logger } from './utils/logger';
import { webhookRouter } from './routes/webhook.routes';
import { reelsRouter } from './routes/reels.routes';
import { templatesRouter } from './routes/templates.routes';
import { logsRouter } from './routes/logs.routes';
import { flowsRouter } from './routes/flows.routes';
import { replyRouter } from './routes/reply.routes';
import { mediaRouter } from './routes/media.routes';
import { authRouter } from './routes/auth.routes';
import { usersRouter } from './routes/users.routes';
import { billingRouter } from './routes/billing.routes';

/**
 * Express augmentation: the raw request body is captured during JSON parsing so
 * the webhook route can HMAC the exact bytes Meta signed.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));

  // CORS for the admin panel. "*" (default) or a comma-separated allowlist.
  const origins =
    config.CORS_ORIGIN === '*'
      ? '*'
      : config.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: origins,
      allowedHeaders: ['content-type', 'x-api-key', 'authorization'],
    }),
  );

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

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/billing', billingRouter);
  app.use('/webhooks', webhookRouter);
  app.use('/reels', reelsRouter);
  app.use('/templates', templatesRouter);
  app.use('/logs', logsRouter);
  app.use('/flows', flowsRouter);
  app.use('/reply', replyRouter);
  app.use('/media', mediaRouter);

  // Serve the built admin SPA (single-origin deploy) if its dist folder exists.
  serveAdminPanel(app);

  // 404 fallback for anything unmatched (API paths, or non-GET on the SPA).
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

/** Prefixes owned by the JSON API — never fall these back to the SPA index. */
const API_PREFIXES = [
  '/auth',
  '/users',
  '/billing',
  '/webhooks',
  '/reels',
  '/templates',
  '/logs',
  '/flows',
  '/reply',
  '/media',
  '/health',
];

/**
 * If the admin panel has been built, serve its static assets and route all
 * non-API GET requests to index.html so client-side routing works. In dev the
 * admin runs on the Vite server instead, so this is simply skipped when the
 * dist folder is absent.
 */
function serveAdminPanel(app: express.Express): void {
  const distPath =
    config.ADMIN_DIST_PATH ?? path.resolve(__dirname, '../admin/dist');
  const indexHtml = path.join(distPath, 'index.html');

  if (!fs.existsSync(indexHtml)) {
    logger.info(
      { distPath },
      'Admin panel build not found — serving API only',
    );
    return;
  }

  app.use(express.static(distPath));

  app.get('*', (req: Request, res: Response, next) => {
    if (API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });

  logger.info({ distPath }, 'Serving admin panel');
}
