export type Role = 'admin' | 'regente' | 'cajero' | 'bodeguero' | 'auditor';
export type SecondFactorMethod = 'webauthn' | 'email_otp';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  regente: 'Regente',
  cajero: 'Cajero',
  bodeguero: 'Bodeguero',
  auditor: 'Auditor',
};

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SessionInfo {
  user: {
    id: string;
    username: string;
    fullName: string;
    role: Role;
    mustChangePassword: boolean;
    hasWebAuthn: boolean;
  };
  permissions: string[];
  stepUpMethods: SecondFactorMethod[];
  sessionExpiresAt: string;
}

export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  locked: boolean;
  lockedUntil: string | null;
  hasWebAuthn: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CredentialInfo {
  id: string;
  nickname: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType?: string;
}

export interface UserDetail extends UserSummary {
  credentials: CredentialInfo[];
}

export interface Lot {
  id: string;
  productId?: string;
  lotNumber: string;
  expiresAt: string;
  quantity: number;
  expired: boolean;
  supplier?: string | null;
  sku?: string;
  productName?: string;
  isControlled?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  activeIngredient: string | null;
  presentation: string;
  category: 'medicamento' | 'cuidado_personal' | 'otros';
  unitPriceCents: number;
  isControlled: boolean;
  minStock: number;
  stock: number;
  lowStock: boolean;
  status: 'active' | 'inactive';
  lots?: Lot[];
}

export interface Movement {
  id: string;
  productId: string;
  lotId: string;
  type: 'receipt' | 'sale' | 'sale_void' | 'adjustment' | 'dispensation';
  quantityDelta: number;
  balanceAfter: number;
  reasonCode: string | null;
  reason: string | null;
  userId: string;
  stepUpMethod: string | null;
  createdAt: string;
  sku: string;
  productName: string;
  isControlled: boolean;
}

export interface SaleItem {
  productId: string;
  lotId: string;
  sku: string;
  name: string;
  isControlled: boolean;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  cashierId: string;
  cashierUsername: string | null;
  customerId: string | null;
  items: SaleItem[];
  totalCents: number;
  payment: {
    method: 'cash' | 'card_simulated';
    amountReceivedCents: number | null;
    changeCents: number | null;
    authorizationRef: string | null;
  };
  pointsEarned: number;
  fromPrescription: boolean;
  status: 'completed' | 'voided';
  void: {
    voidedAt: string;
    voidedBy: string;
    voidedByUsername: string | null;
    reason: string;
    stepUpMethod: string;
  } | null;
  createdAt: string;
}

export interface CustomerSummary {
  id: string;
  fullName: string;
  phoneMasked: string | null;
  pointsBalance: number;
  status: 'active' | 'withdrawn';
}

export interface CustomerDetail extends CustomerSummary {
  phone: string | null;
  email: string | null;
  consent: { noticeVersion: string; acceptedAt: string; withdrawnAt: string | null };
  pointsHistory: { id: string; type: string; points: number; saleId: string; createdAt: string }[];
  createdAt: string;
}

export interface PrivacyNotice {
  version: string;
  title: string;
  text: string[];
}

export type PrescriptionStatus = 'registered' | 'partially_dispensed' | 'dispensed' | 'cancelled';

export interface PrescriptionSummary {
  id: string;
  folio: string;
  issuedAt: string;
  status: PrescriptionStatus;
  hasControlled: boolean;
  expired: boolean;
  createdAt: string;
}

export interface PrescriptionDetail extends PrescriptionSummary {
  customerId: string | null;
  patientName: string;
  doctorName: string;
  doctorLicense: string;
  notes: string | null;
  validUntil: string;
  items: {
    productId: string;
    productName: string;
    dosage: string;
    quantityPrescribed: number;
    quantityDispensed: number;
    quantityRemaining: number;
    isControlled: boolean;
  }[];
  cancel: { cancelledAt: string; reason: string } | null;
}

export interface AuditEntry {
  seq: number;
  timestamp: string;
  userId: string | null;
  username: string | null;
  role: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  result: 'success' | 'failure' | 'denied';
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  lastSeq: number | null;
  lastHash: string | null;
  brokenAtSeq?: number;
  reason?: 'hash' | 'prevHash' | 'gap';
}

export interface ReportData {
  name: string;
  columns: { key: string; header: string }[];
  rows: Record<string, unknown>[];
}
