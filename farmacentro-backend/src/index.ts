import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { assertReplicaSet, diagnoseConnectionFailure } from './db/replicaSet.js';

async function main(): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    throw new Error(await diagnoseConnectionFailure(env.MONGODB_URI));
  }
  await assertReplicaSet();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'FarmaCentro API listening');
  });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'API failed to start');
  // Human-readable hint (e.g. how to enable the local replica set).
  if (error instanceof Error) console.error(error.message);
  process.exit(1);
});
