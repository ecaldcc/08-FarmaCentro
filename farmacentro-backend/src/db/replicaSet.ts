import mongoose from 'mongoose';

export const REPLICA_SET_HELP = `
MongoDB está funcionando como servidor único (standalone). FarmaCentro usa transacciones para
ventas, anulaciones y ajustes de inventario (CLAUDE.md, "Integridad"), y MongoDB solo las permite
en un replica set. Atlas ya lo es. Para tu MongoDB local (una sola vez, como administrador):

  1. Edita C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.cfg y cambia "#replication:" por:
       replication:
         replSetName: rs0
  2. Reinicia el servicio:  Restart-Service MongoDB
  3. Inicializa el replica set:  npm run init-replica-set   (en farmacentro-backend)
`;

/** Transactions (sales, voids, adjustments) require a replica set; fail fast with instructions. */
export async function assertReplicaSet(): Promise<void> {
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName) {
    throw new Error(REPLICA_SET_HELP);
  }
}

/**
 * Explains a failed connection. A URI with ?replicaSet=rs0 never connects to a standalone server,
 * so the server is probed directly to tell "service stopped" apart from "replica set not enabled".
 */
export async function diagnoseConnectionFailure(uri: string): Promise<string> {
  const safeUri = uri.replace(/\/\/[^@]*@/, '//***@');
  const probe = mongoose.createConnection(uri, { directConnection: true, serverSelectionTimeoutMS: 3000 });
  try {
    await probe.asPromise();
    const hello = await probe.db!.admin().command({ hello: 1 });
    return hello.setName
      ? `No se pudo conectar a ${safeUri}: el replica set se llama "${String(hello.setName)}"; revisa ?replicaSet= en la cadena.`
      : REPLICA_SET_HELP;
  } catch {
    return `No se pudo conectar a MongoDB (${safeUri}). ¿Está encendido el servicio? (Get-Service MongoDB)`;
  } finally {
    await probe.close().catch(() => undefined);
  }
}
