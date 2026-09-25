import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** farmacentro-backend/ */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Repository root (contains farmacentro-backend/, Farmacentro-Frontend/ and docs/). */
export const REPO_ROOT = path.resolve(ROOT, '..');
/** Evidence for the auditor group lives in the shared docs folder. */
export const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs/evidencias');

/**
 * Loads scripts/.env (privileged connection strings) and .env (API configuration and encryption
 * keys) into process.env. Must run BEFORE importing any module from src/, because
 * src/config/env.ts validates the environment at import time.
 */
export function loadScriptEnv(): void {
  for (const file of [path.join(ROOT, 'scripts/.env'), path.join(ROOT, '.env')]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

export function requireVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable ${name}. Revisa .env.example y scripts/.env.example.`);
    process.exit(1);
  }
  return value;
}

/**
 * Connection string for privileged scripts. In local development (a MongoDB without users) it
 * falls back to MONGODB_URI; in production the separate migrator user is mandatory.
 */
export function adminUri(): string {
  if (process.env.MONGODB_URI_ADMIN) return process.env.MONGODB_URI_ADMIN;
  if (process.env.NODE_ENV !== 'production' && process.env.MONGODB_URI) return process.env.MONGODB_URI;
  return requireVar('MONGODB_URI_ADMIN');
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}
