/**
 * Runs `npm audit` on the backend and the frontend, saves the result as evidence (control 8.8)
 * and fails when there are high or critical vulnerabilities (CLAUDE.md "Dependencias").
 *
 *   npm run audit:check
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR, REPO_ROOT, ROOT } from './lib/env.js';

interface AuditJson {
  metadata?: { vulnerabilities?: Record<string, number>; dependencies?: { total?: number } };
}

const projects = [
  { name: 'farmacentro-backend', dir: ROOT },
  { name: 'Farmacentro-Frontend', dir: path.join(REPO_ROOT, 'Farmacentro-Frontend') },
].filter((p) => existsSync(path.join(p.dir, 'package-lock.json')));

const lines = [`npm audit — ${new Date().toISOString()}`];
let blocking = false;
for (const project of projects) {
  const run = spawnSync('npm', ['audit', '--json'], { cwd: project.dir, encoding: 'utf8', shell: process.platform === 'win32' });
  const report = JSON.parse(run.stdout || '{}') as AuditJson;
  const counts = report.metadata?.vulnerabilities ?? {};
  blocking ||= (counts.critical ?? 0) > 0 || (counts.high ?? 0) > 0;
  lines.push(
    '',
    `[${project.name}] dependencias analizadas: ${report.metadata?.dependencies?.total ?? 'desconocido'}`,
    `  Críticas: ${counts.critical ?? 0} · Altas: ${counts.high ?? 0} · Moderadas: ${counts.moderate ?? 0} · Bajas: ${counts.low ?? 0}`,
  );
}

const summary = lines.join('\n');
console.log(summary);
mkdirSync(EVIDENCE_DIR, { recursive: true });
const file = path.join(EVIDENCE_DIR, `npm-audit-${new Date().toISOString().slice(0, 10)}.txt`);
writeFileSync(file, `${summary}\n`);
console.log(`Evidencia guardada en ${path.relative(REPO_ROOT, file)}`);

if (blocking) {
  console.error('Hay vulnerabilidades altas o críticas: corrígelas antes de entregar.');
  process.exitCode = 1;
}
