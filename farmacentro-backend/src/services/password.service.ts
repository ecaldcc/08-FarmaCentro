import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { COMMON_PASSWORDS } from '../data/commonPasswords.js';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes

// Precomputed hash used to spend the same time when the user does not exist (anti-enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', env.BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function spendDummyCompare(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

/** Returns the list of broken rules in Spanish (empty when the password is acceptable). */
export function checkPasswordPolicy(password: string, username: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    problems.push('Es demasiado larga (máximo 72 bytes).');
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    problems.push('No puede contener el nombre de usuario.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push('Es una contraseña demasiado común.');
  }
  if (new Set(password).size < 4) {
    problems.push('Usa más variedad de caracteres.');
  }
  return problems;
}

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%*';

/** Random 16-character temporary password; shown once and replaced on first login. */
export function generateTemporaryPassword(): string {
  let result = '';
  for (let i = 0; i < 16; i += 1) {
    result += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  }
  return result;
}
