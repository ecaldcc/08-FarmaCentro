import { randomBytes } from 'node:crypto';

/**
 * Prints fresh random secrets for server/.env. Nothing is written to disk: copy the output into
 * your local .env (which is excluded by .gitignore). Use different values in every environment.
 */
const key = () => randomBytes(32).toString('base64');

console.log('# Pega estas líneas en server/.env (no las compartas ni las subas a Git)');
console.log(`SESSION_SECRET=${randomBytes(48).toString('hex')}`);
console.log('DATA_ENC_ACTIVE_VERSION=1');
console.log(`DATA_ENC_KEY_V1=${key()}`);
console.log(`BLIND_INDEX_KEY=${key()}`);
console.log(`OTP_HMAC_KEY=${key()}`);
console.log('');
console.log('# Y esta en scripts/.env (clave para cifrar los respaldos)');
console.log(`BACKUP_ENC_KEY=${key()}`);
