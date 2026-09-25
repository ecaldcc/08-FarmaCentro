import MongoStore from 'connect-mongo';
import session from 'express-session';
import mongoose from 'mongoose';
import { env } from './env.js';

export const SESSION_COOKIE = 'fc.sid';

/**
 * Server-side session (controls 5.17, 8.5): cookie httpOnly + Secure + SameSite=Strict,
 * rolling expiry after SESSION_IDLE_MINUTES (15) of inactivity, stored in MongoDB.
 */
export function sessionMiddleware() {
  const idleMs = env.SESSION_IDLE_MINUTES * 60 * 1000;
  return session({
    name: SESSION_COOKIE,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    unset: 'destroy',
    // Outside production the dev proxy (Vite) and the tests declare HTTPS with X-Forwarded-Proto,
    // so express-session can issue a Secure cookie on http://localhost (browsers accept it there).
    proxy: env.NODE_ENV === 'production' ? undefined : true,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: idleMs,
    },
    store: MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: env.SESSION_IDLE_MINUTES * 60,
      autoRemove: 'disabled', // TTL index is created by scripts/setup-db.ts (no createIndex for the API)
      touchAfter: 0,
      stringify: true,
    }),
  });
}
