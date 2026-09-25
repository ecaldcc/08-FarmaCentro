import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

/** One in-memory replica set for the whole run (transactions need a replica set). */
export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = replSet.getUri('farmacentro_test');
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
}
