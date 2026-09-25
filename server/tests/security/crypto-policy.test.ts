import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { EnvSchema } from '../../src/config/env.js';
import { decryptField, encryptField } from '../../src/services/crypto.service.js';
import { safeCell, toCsv } from '../../src/services/csv.service.js';
import { checkPasswordPolicy, hashPassword } from '../../src/services/password.service.js';

describe('AES-256-GCM field encryption (8.24)', () => {
  it('uses a fresh random IV for every record', () => {
    const id = new Types.ObjectId();
    const a = encryptField('prescriptions', id, 'notes', 'mismo texto');
    const b = encryptField('prescriptions', id, 'notes', 'mismo texto');
    expect(a.iv.length).toBe(12);
    expect(a.tag.length).toBe(16);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ct.equals(b.ct)).toBe(false);
    expect(decryptField('prescriptions', id, 'notes', a)).toBe('mismo texto');
  });

  it('binds the ciphertext to its record and field (AAD)', () => {
    const id = new Types.ObjectId();
    const value = encryptField('prescriptions', id, 'patientName', 'Pedro');
    expect(() => decryptField('prescriptions', new Types.ObjectId(), 'patientName', value)).toThrow();
    expect(() => decryptField('prescriptions', id, 'doctorName', value)).toThrow();
  });

  it('detects tampering with the ciphertext', () => {
    const id = new Types.ObjectId();
    const value = encryptField('customers', id, 'phone', '55512345');
    const tampered = { ...value, ct: Buffer.from(value.ct) };
    tampered.ct[0] = (tampered.ct[0] ?? 0) ^ 0xff;
    expect(() => decryptField('customers', id, 'phone', tampered)).toThrow();
  });
});

describe('password policy (5.17)', () => {
  it('enforces 12+ characters, no username, no common passwords, max 72 bytes', () => {
    expect(checkPasswordPolicy('Corta-123', 'maria')).not.toEqual([]);
    expect(checkPasswordPolicy('maria-es-la-mejor-2026', 'maria')).not.toEqual([]);
    expect(checkPasswordPolicy('password1234', 'maria')).not.toEqual([]);
    expect(checkPasswordPolicy('ñ'.repeat(40), 'maria')).not.toEqual([]);
    expect(checkPasswordPolicy('Lluvia-Sobre-Antigua-77', 'maria')).toEqual([]);
  });

  it('hashes with bcrypt and a salt', async () => {
    const a = await hashPassword('Lluvia-Sobre-Antigua-77');
    const b = await hashPassword('Lluvia-Sobre-Antigua-77');
    expect(a).toMatch(/^\$2b\$/);
    expect(a).not.toBe(b);
  });

  it('refuses a bcrypt cost below 12 outside the automated tests', () => {
    const base = {
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://farmacentro.example',
      MONGODB_URI: 'mongodb+srv://user@cluster.example/farmacentro',
      SESSION_SECRET: 'x'.repeat(48),
      DATA_ENC_KEY_V1: Buffer.alloc(32).toString('base64'),
      BLIND_INDEX_KEY: Buffer.alloc(32).toString('base64'),
      OTP_HMAC_KEY: Buffer.alloc(32).toString('base64'),
      RP_ID: 'farmacentro.example',
    };
    expect(EnvSchema.safeParse({ ...base, BCRYPT_COST: '10' }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base, MAIL_TRANSPORT: 'memory' }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...base, RATE_LIMIT_FACTOR: '100' }).success).toBe(false);
    const ok = EnvSchema.safeParse(base);
    expect(ok.success).toBe(true);
    expect(ok.data?.BCRYPT_COST).toBe(12);
    expect(ok.data?.SESSION_IDLE_MINUTES).toBe(15);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formula injection', () => {
    expect(safeCell('=HYPERLINK("http://evil")')).toBe(`'=HYPERLINK("http://evil")`);
    expect(safeCell('+1')).toBe("'+1");
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeCell('normal')).toBe('normal');
    const csv = toCsv([{ key: 'a', header: 'a' }], [{ a: '=1+1' }]);
    expect(csv).toContain("'=1+1");
  });
});
