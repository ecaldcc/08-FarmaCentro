import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { sessionMiddleware } from './config/session.js';
import { loadUser } from './middlewares/auth.js';
import { requestId, requireJson, verifyOrigin } from './middlewares/basic.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import { apiLimiter } from './middlewares/rateLimits.js';
import { apiRouter } from './routes/index.js';

// Built frontend (Farmacentro-Frontend/dist) served from the same origin when SERVE_CLIENT=true.
const clientDist = env.CLIENT_DIST
  ? path.resolve(env.CLIENT_DIST)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../Farmacentro-Frontend/dist');

/** Builds the Express application with the middleware chain of docs/arquitectura.md §4. */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
        },
      },
      strictTransportSecurity: env.NODE_ENV === 'production',
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ requestId: (req as express.Request).requestId }) }));

  app.use('/api', verifyOrigin);
  app.use(
    '/api',
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: ['X-Request-Id', 'X-Session-Expires-At'],
    }),
  );
  app.use('/api', express.json({ limit: '100kb', type: 'application/json' }), requireJson);
  app.use('/api', sessionMiddleware(), loadUser, apiLimiter);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', apiRouter);
  app.use('/api', notFound);

  if (env.SERVE_CLIENT) {
    // Single origin for client and API (SameSite=Strict, CSP 'self', WebAuthn RP ID).
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
