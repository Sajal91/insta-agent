import { config } from './config/env';
import { logger } from './utils/logger';
import { createApp } from './app';
import { connectDb, closeDb } from './db';
import { commentQueue } from './services/queue.service';

async function main(): Promise<void> {
  // Connect to MongoDB (ensures indexes + seeds default templates) before serving.
  await connectDb();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      'insta-agent listening',
    );
  });

  // Don't let a stray async error take the whole process down.
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');

    server.close(async () => {
      try {
        // Let any in-flight comment processing finish before closing the DB.
        await commentQueue.onIdle();
      } catch (err) {
        logger.error({ err }, 'Error draining queue during shutdown');
      }
      await closeDb();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Hard-exit safety net if graceful close hangs.
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
