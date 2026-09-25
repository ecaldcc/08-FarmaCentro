import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Loads scripts/.env (privileged connection strings) and server/.env (encryption keys) into
 * process.env. Must run BEFORE importing any server module, because server/src/config/env.ts
 * validates the environment at import time.
 */
export function loadScriptEnv(): void {
  for (const file of [path.join(ROOT, 'scripts/.env'), path.join(ROOT, 'server/.env')]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}

export function requireVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable ${name}. Revisa scripts/.env.example.`);
    process.exit(1);
  }
  return value;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}
