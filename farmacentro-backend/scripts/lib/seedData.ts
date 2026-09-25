import mongoose from 'mongoose';
import { PRIVACY_NOTICE } from '../../src/data/privacyNotice.js';
import type { Role } from '../../src/domain/roles.js';
import { InventoryLot } from '../../src/models/InventoryLot.js';
import { User } from '../../src/models/User.js';
import * as customers from '../../src/services/customer.service.js';
import * as inventory from '../../src/services/inventory.service.js';
import { checkPasswordPolicy, hashPassword } from '../../src/services/password.service.js';
import * as prescriptions from '../../src/services/prescription.service.js';
import * as products from '../../src/services/product.service.js';
import * as sales from '../../src/services/sale.service.js';
import { gtToday } from '../../src/utils/dates.js';

export const DEV_PASSWORD = 'FarmaCentro-Demo-2026!';

/**
 * E-mail of each demo user. Locally the fictitious @farmacentro.test addresses are enough (codes are
 * printed in the terminal). When deployed, codes are really sent: with SEED_EMAIL=equipo@gmail.com
 * every user gets a sub-address of that mailbox (equipo+regente@gmail.com), which Gmail delivers.
 */
export function demoEmail(username: string, seedEmail = process.env.SEED_EMAIL): string {
  if (!seedEmail) return `${username}@farmacentro.test`;
  const [local, domain] = seedEmail.trim().toLowerCase().split('@');
  if (!local || !domain) throw new Error('SEED_EMAIL debe ser un correo válido');
  return `${local}+${username}@${domain}`;
}

/**
 * Fictitious demo data: one user per role, catalog, lots, customers with consent, sales, a void
 * and a prescription. Everything goes through the real services, so the audit log is populated.
 * Import this module only AFTER the environment is loaded (src/config/env.ts validates on import).
 * Expects an open connection to an empty database whose schema already exists.
 */
export async function seedDemoData(seedPassword: string, isProduction: boolean): Promise<void> {
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
    throw new Error(`SEED_PASSWORD no cumple la política: ${passwordProblems.join(' ')}`);
  }
  const passwordHash = await hashPassword(seedPassword);
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const user = await User.create({
      ...u,
      email: demoEmail(u.username),
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
      // Fictitious NIT with a valid check digit.
      billing: { type: 'NIT', taxId: '12345679', name: 'María Fernanda López' },
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
    {
      items: [{ productId: productIds['AMOX-500']!, quantity: 1 }],
      payment: { method: 'card_simulated' },
      billing: { type: 'CF' },
    },
    ids.regente!,
    ctx('regente'),
    null,
  );
  console.log(`Receta ${recipe.folio} registrada y despachada parcialmente.`);

}
