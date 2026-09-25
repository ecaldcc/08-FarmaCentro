/**
 * Fictitious test data: one user per role, catalog, lots, customers with consent, sales, a void
 * and a prescription. Everything goes through the real services, so the audit log is populated.
 *
 *   npm run seed              (only on an empty database)
 *   npm run seed -- --reset   (DELETES all data, including the audit log, then seeds again)
 */
import { hasFlag, loadScriptEnv, requireVar } from './lib/env.js';

loadScriptEnv();
const adminUri = requireVar('MONGODB_URI_ADMIN');
process.env.MONGODB_URI ??= adminUri;

const isProduction = process.env.NODE_ENV === 'production';
const DEV_PASSWORD = 'FarmaCentro-Demo-2026!';
const seedPassword = process.env.SEED_PASSWORD ?? (isProduction ? undefined : DEV_PASSWORD);
if (!seedPassword) {
  console.error('En producción define SEED_PASSWORD (la contraseña de demostración es pública en el repositorio).');
  process.exit(1);
}

const mongoose = (await import('mongoose')).default;
const { ensureSchema } = await import('../server/src/db/schema.js');
const { PRIVACY_NOTICE } = await import('../server/src/data/privacyNotice.js');
const { User } = await import('../server/src/models/User.js');
const { InventoryLot } = await import('../server/src/models/InventoryLot.js');
const { appendAudit, SYSTEM_CONTEXT } = await import('../server/src/services/audit.service.js');
const { hashPassword, checkPasswordPolicy } = await import('../server/src/services/password.service.js');
const products = await import('../server/src/services/product.service.js');
const inventory = await import('../server/src/services/inventory.service.js');
const customers = await import('../server/src/services/customer.service.js');
const sales = await import('../server/src/services/sale.service.js');
const prescriptions = await import('../server/src/services/prescription.service.js');
const { gtToday } = await import('../server/src/utils/dates.js');
type Role = import('../server/src/domain/roles.js').Role;

await mongoose.connect(adminUri, { autoIndex: false, autoCreate: false });
const db = mongoose.connection.db!;

if (hasFlag('--reset')) {
  for (const collection of await db.collections()) {
    await collection.deleteMany({});
  }
  console.log('Base de datos vaciada (--reset).');
} else if ((await User.estimatedDocumentCount()) > 0) {
  console.error('La base ya tiene datos. Usa "npm run seed -- --reset" para vaciarla y sembrar de nuevo.');
  await mongoose.disconnect();
  process.exit(1);
}

await ensureSchema();
await appendAudit(SYSTEM_CONTEXT, { action: 'system.genesis', result: 'success', details: { note: 'Datos de prueba' } });

// ------------------------------------------------------------------------------------ users
const USERS: { username: string; fullName: string; role: Role }[] = [
  { username: 'admin', fullName: 'Ana Administradora', role: 'admin' },
  { username: 'regente', fullName: 'Roberto Regente', role: 'regente' },
  { username: 'cajero', fullName: 'Carla Cajera', role: 'cajero' },
  { username: 'bodeguero', fullName: 'Bruno Bodeguero', role: 'bodeguero' },
  { username: 'auditor', fullName: 'Aurora Auditora', role: 'auditor' },
];
const passwordProblems = USERS.flatMap((u) => checkPasswordPolicy(seedPassword, u.username));
if (passwordProblems.length > 0) {
  console.error(`SEED_PASSWORD no cumple la política: ${passwordProblems.join(' ')}`);
  process.exit(1);
}
const passwordHash = await hashPassword(seedPassword);
const ids: Record<string, string> = {};
for (const u of USERS) {
  const user = await User.create({
    ...u,
    email: `${u.username}@farmacentro.test`,
    passwordHash,
    passwordChangedAt: new Date(),
    mustChangePassword: isProduction, // in production every account must pick its own password
  });
  ids[u.role] = String(user._id);
}
const ctx = (role: Role) => ({
  actor: { userId: ids[role]!, username: role, role },
  ip: '127.0.0.1',
  userAgent: 'scripts/seed.ts',
  requestId: null,
});
console.log(`Usuarios creados: ${USERS.map((u) => u.username).join(', ')}`);

// --------------------------------------------------------------------------- catalog + lots
const CATALOG = [
  { sku: 'ACET-500', name: 'Acetaminofén 500 mg', activeIngredient: 'Paracetamol', presentation: 'Caja 10 tabletas', unitPriceCents: 1500, minStock: 20 },
  { sku: 'IBUP-400', name: 'Ibuprofeno 400 mg', activeIngredient: 'Ibuprofeno', presentation: 'Caja 10 tabletas', unitPriceCents: 2200, minStock: 20 },
  { sku: 'AMOX-500', name: 'Amoxicilina 500 mg', activeIngredient: 'Amoxicilina', presentation: 'Caja 21 cápsulas', unitPriceCents: 6500, minStock: 10 },
  { sku: 'LORA-10', name: 'Loratadina 10 mg', activeIngredient: 'Loratadina', presentation: 'Caja 10 tabletas', unitPriceCents: 3000, minStock: 10 },
  { sku: 'OMEP-20', name: 'Omeprazol 20 mg', activeIngredient: 'Omeprazol', presentation: 'Caja 14 cápsulas', unitPriceCents: 4500, minStock: 10 },
  { sku: 'SUERO-ORAL', name: 'Suero oral sabor naranja', activeIngredient: null, presentation: 'Botella 500 ml', unitPriceCents: 1200, minStock: 15 },
  { sku: 'BLOQ-50', name: 'Bloqueador solar FPS 50', activeIngredient: null, presentation: 'Tubo 120 ml', unitPriceCents: 9500, minStock: 5, category: 'cuidado_personal' },
  { sku: 'ALCO-GEL', name: 'Alcohol en gel', activeIngredient: null, presentation: 'Frasco 250 ml', unitPriceCents: 1800, minStock: 10, category: 'cuidado_personal' },
  { sku: 'CLON-2', name: 'Clonazepam 2 mg', activeIngredient: 'Clonazepam', presentation: 'Caja 30 tabletas', unitPriceCents: 8500, minStock: 5, controlled: true },
  { sku: 'TRAM-50', name: 'Tramadol 50 mg', activeIngredient: 'Tramadol', presentation: 'Caja 10 cápsulas', unitPriceCents: 7200, minStock: 5, controlled: true },
  { sku: 'ALPR-05', name: 'Alprazolam 0.5 mg', activeIngredient: 'Alprazolam', presentation: 'Caja 30 tabletas', unitPriceCents: 6900, minStock: 5, controlled: true },
] as const;

function isoInDays(days: number): string {
  return gtToday(new Date(Date.now() + days * 86_400_000));
}

const productIds: Record<string, string> = {};
for (const item of CATALOG) {
  const created = await products.createProduct(
    {
      sku: item.sku,
      name: item.name,
      activeIngredient: item.activeIngredient ?? undefined,
      presentation: item.presentation,
      category: 'category' in item ? item.category : 'medicamento',
      unitPriceCents: item.unitPriceCents,
      minStock: item.minStock,
    },
    ids.bodeguero!,
    ctx('bodeguero'),
  );
  productIds[item.sku] = created.id;
  if ('controlled' in item && item.controlled) {
    await products.setControlled(created.id, true, 'Medicamento controlado según normativa del MSPAS', ids.regente!, ctx('regente'), 'seed');
  }
  await inventory.receiveStock(
    { productId: created.id, lotNumber: `${item.sku}-L1`, expiresAt: isoInDays(45), quantity: 25 },
    ids.bodeguero!,
    ctx('bodeguero'),
  );
  await inventory.receiveStock(
    { productId: created.id, lotNumber: `${item.sku}-L2`, expiresAt: isoInDays(400), quantity: 60, supplier: 'Droguería Ficticia, S.A.' },
    ids.bodeguero!,
    ctx('bodeguero'),
  );
}
// One expired lot with stock, to exercise the expiry report (inserted directly: it cannot be received).
await InventoryLot.create({
  productId: new mongoose.Types.ObjectId(productIds['LORA-10']),
  lotNumber: 'LORA-10-VENCIDO',
  expiresAt: new Date(Date.now() - 10 * 86_400_000),
  quantity: 4,
  receivedAt: new Date(Date.now() - 200 * 86_400_000),
  receivedBy: new mongoose.Types.ObjectId(ids.bodeguero),
});
console.log(`Catálogo: ${CATALOG.length} productos (3 controlados) con 2 lotes cada uno y un lote vencido.`);

// -------------------------------------------------------------------------------- customers
const consent = { accepted: true as const, noticeVersion: PRIVACY_NOTICE.version };
const maria = await customers.createCustomer(
  { fullName: 'María Fernanda López', phone: '55510001', email: 'maria.lopez@example.com', consent },
  ids.cajero!,
  ctx('cajero'),
);
await customers.createCustomer({ fullName: 'José Ramírez', phone: '55510002', consent }, ids.cajero!, ctx('cajero'));
await customers.createCustomer({ fullName: 'Lucía Hernández', phone: '55510003', consent }, ids.cajero!, ctx('cajero'));
console.log('Clientes de fidelización: 3 (con consentimiento registrado).');

// ------------------------------------------------------------------------------------ sales
await sales.createSale(
  {
    customerId: maria.id,
    items: [
      { productId: productIds['ACET-500']!, quantity: 2 },
      { productId: productIds['SUERO-ORAL']!, quantity: 3 },
    ],
    payment: { method: 'card_simulated' },
  },
  ids.cajero!,
  ctx('cajero'),
);
const toVoid = await sales.createSale(
  { items: [{ productId: productIds['IBUP-400']!, quantity: 1 }], payment: { method: 'cash', amountReceivedCents: 5000 } },
  ids.cajero!,
  ctx('cajero'),
);
await sales.voidSale(toVoid.id, 'Cliente devolvió el producto sin abrir', ids.regente!, ctx('regente'), 'seed');
console.log('Ventas: 2 (una anulada por el Regente).');

// ---------------------------------------------------------------------------- prescriptions
const recipe = await prescriptions.createPrescription(
  {
    customerId: maria.id,
    patientName: 'María Fernanda López',
    doctorName: 'Dr. Julio Estrada',
    doctorLicense: 'COL-10458',
    issuedAt: gtToday(),
    items: [
      { productId: productIds['CLON-2']!, dosage: '1 tableta por la noche durante 10 días', quantityPrescribed: 1 },
      { productId: productIds['AMOX-500']!, dosage: '1 cápsula cada 8 horas por 7 días', quantityPrescribed: 1 },
    ],
    notes: 'Paciente ficticio para pruebas',
  },
  ids.regente!,
  ctx('regente'),
);
await prescriptions.dispensePrescription(
  recipe.id,
  { items: [{ productId: productIds['AMOX-500']!, quantity: 1 }], payment: { method: 'card_simulated' } },
  ids.regente!,
  ctx('regente'),
  null,
);
console.log(`Receta ${recipe.folio} registrada y despachada parcialmente.`);

console.log('\nListo. Las credenciales de prueba están en docs/credenciales-prueba.md.');
await mongoose.disconnect();
