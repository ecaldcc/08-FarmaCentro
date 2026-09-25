/**
 * Initializes a single-node replica set ("rs0") on a local MongoDB so transactions work.
 * Prerequisite: mongod.cfg has `replication: replSetName: rs0` and the service was restarted.
 * Atlas does not need this (it is already a replica set).
 *
 *   npm run init-replica-set
 */
import mongoose from 'mongoose';

const HOST = process.env.MONGO_LOCAL_HOST ?? 'localhost:27017';

await mongoose.connect(`mongodb://${HOST}/admin`, { directConnection: true, serverSelectionTimeoutMS: 5000 });
const admin = mongoose.connection.db!.admin();

const hello = await admin.command({ hello: 1 });
if (hello.setName) {
  console.log(`El replica set "${hello.setName}" ya está activo. No hay nada que hacer.`);
} else {
  try {
    await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: HOST }] } });
  } catch (error) {
    const message = (error as Error).message;
    if (/not running with --replSet|replSet/i.test(message)) {
      console.error('MongoDB no tiene habilitada la replicación. Agrega en mongod.cfg:');
      console.error('  replication:\n    replSetName: rs0');
      console.error('y reinicia el servicio (Restart-Service MongoDB) antes de volver a ejecutar este comando.');
      await mongoose.disconnect();
      process.exit(1);
    }
    throw error;
  }
  for (let i = 0; i < 30; i += 1) {
    const state = await admin.command({ hello: 1 });
    if (state.isWritablePrimary) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log('Replica set "rs0" iniciado. Usa en .env:');
  console.log(`  MONGODB_URI=mongodb://${HOST}/farmacentro`);
}
await mongoose.disconnect();
