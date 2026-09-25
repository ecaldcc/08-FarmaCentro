/**
 * Runs `npm audit`, saves the result as evidence (control 8.8) and fails when there are high or
 * critical vulnerabilities (CLAUDE.md "Dependencias").
 *
 *   npm run audit:check
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/env.js';

const run = spawnSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
const report = JSON.parse(run.stdout || '{}') as {
  metadata?: { vulnerabilities?: Record<string, number>; dependencies?: { total?: number } };
};
const counts = report.metadata?.vulnerabilities ?? {};
const summary = [
  `npm audit — ${new Date().toISOString()}`,
  `Dependencias analizadas: ${report.metadata?.dependencies?.total ?? 'desconocido'}`,
  `Críticas: ${counts.critical ?? 0}`,
  `Altas: ${counts.high ?? 0}`,
  `Moderadas: ${counts.moderate ?? 0}`,
  `Bajas: ${counts.low ?? 0}`,
  `Informativas: ${counts.info ?? 0}`,
].join('\n');

console.log(summary);
const dir = path.join(ROOT, 'docs/evidencias');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `npm-audit-${new Date().toISOString().slice(0, 10)}.txt`);
writeFileSync(file, `${summary}\n`);
console.log(`Evidencia guardada en ${path.relative(ROOT, file)}`);

if ((counts.critical ?? 0) > 0 || (counts.high ?? 0) > 0) {
  console.error('Hay vulnerabilidades altas o críticas: corrígelas antes de entregar.');
  process.exitCode = 1;
}
