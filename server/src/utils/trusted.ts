import mongoose from 'mongoose';

/**
 * Marks a query operator object built by the server (never by the client) as trusted,
 * so that sanitizeFilter does not neutralise it. Never pass user input directly here.
 */
export function op<T extends object>(operators: T): T {
  return mongoose.trusted(operators) as T;
}
