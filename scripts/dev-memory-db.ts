/**
 * Local development database without Atlas: an in-memory MongoDB replica set (supports
 * transactions). Data is lost when the process stops. It has NO authentication, so it does not
 * demonstrate the custom API role — use Atlas for that.
 *
 *   npm run dev:db
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27018 }],
});
const uri = replSet.getUri('farmacentro');
console.log('MongoDB en memoria listo (los datos se pierden al detenerlo).');
console.log(`Usa esta cadena en server/.env (MONGODB_URI) y en scripts/.env (MONGODB_URI_ADMIN):\n${uri}`);
console.log('Presiona Ctrl+C para detenerlo.');

const stop = async () => {
  await replSet.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Keep the event loop alive: an unresolved promise alone makes Node exit with code 13.
setInterval(() => undefined, 60 * 60 * 1000);
