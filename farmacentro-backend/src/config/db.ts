import mongoose from 'mongoose';
import { withDefaultDb } from '../db/uri.js';
import { env } from './env.js';

// Injection protections (CLAUDE.md, control 8.28): operators coming from user input are
// neutralised by sanitizeFilter; our own operators must be wrapped with trusted().
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);
// The API database user has no createIndex privilege; indexes are created by scripts/setup-db.ts.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  return mongoose.connect(withDefaultDb(uri), {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
