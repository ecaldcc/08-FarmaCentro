/**
 * Provisions MongoDB Atlas from code (Atlas Administration API v2, service account):
 *   - custom roles farmacentroApi and auditReader, exactly as API_ROLE_PRIVILEGES / AUDIT_READER_PRIVILEGES
 *     (creates them, or corrects them if they were created by hand with a difference);
 *   - database users farmacentro_migrator, farmacentro_api and farmacentro_audit_reader, scoped to the cluster;
 *   - their connection strings, written into .env.production (passwords are never printed).
 *
 *   npm run atlas:provision                       roles + missing users
 *   npm run atlas:provision -- --add-my-ip        also adds this PC's public IP to Network Access
 *   npm run atlas:provision -- --rotate-passwords also resets the passwords of existing users
 *
 * Requires in .env.production: ATLAS_CLIENT_ID, ATLAS_CLIENT_SECRET, ATLAS_PROJECT_ID (and optionally
 * ATLAS_CLUSTER_NAME, default "farmacentro"). See docs/manual-instalacion.md §4.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasFlag, loadScriptEnv, requireVar, ROOT } from './lib/env.js';

loadScriptEnv();
const clientId = requireVar('ATLAS_CLIENT_ID');
const clientSecret = requireVar('ATLAS_CLIENT_SECRET');
const projectId = requireVar('ATLAS_PROJECT_ID');
const clusterName = process.env.ATLAS_CLUSTER_NAME ?? 'farmacentro';
const DB = 'farmacentro';

const { API_ROLE_PRIVILEGES, AUDIT_READER_PRIVILEGES } = await import('../src/db/schema.js');

const API = `https://cloud.mongodb.com/api/atlas/v2/groups/${projectId}`;
const ACCEPT = 'application/vnd.atlas.2023-01-01+json';

// ------------------------------------------------------------------------------------ token
const tokenRes = await fetch('https://cloud.mongodb.com/api/oauth/token', {
  method: 'POST',
  headers: {
    accept: 'application/json',
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
});
if (!tokenRes.ok) {
  console.error(`No se pudo obtener el token de Atlas (HTTP ${tokenRes.status}). Revisa ATLAS_CLIENT_ID y ATLAS_CLIENT_SECRET.`);
  process.exit(1);
}
const token = ((await tokenRes.json()) as { access_token: string }).access_token;

async function atlas<T>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, {
    method,
    headers: {
      accept: ACCEPT,
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': ACCEPT }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : null;
  if (!res.ok && res.status !== 404) {
    const detail = (data as { detail?: string; errorCode?: string } | null) ?? {};
    throw new Error(`Atlas ${method} ${url.replace(API, '')} → HTTP ${res.status} ${detail.errorCode ?? ''} ${detail.detail ?? ''}`);
  }
  return { status: res.status, data };
}

// ------------------------------------------------------------------------------ custom roles
interface RoleAction {
  action: string;
  resources: { db: string; collection: string }[];
}

function toActions(privileges: Readonly<Record<string, readonly string[]>>): RoleAction[] {
  const byAction = new Map<string, { db: string; collection: string }[]>();
  for (const [collection, actions] of Object.entries(privileges)) {
    for (const action of actions) {
      const key = action.toUpperCase();
      byAction.set(key, [...(byAction.get(key) ?? []), { db: DB, collection }]);
    }
  }
  return [...byAction.entries()].map(([action, resources]) => ({ action, resources }));
}

function signature(actions: RoleAction[] | undefined): string {
  return JSON.stringify(
    (actions ?? [])
      .flatMap((a) => a.resources.map((r) => `${a.action}@${r.db}.${r.collection}`))
      .sort(),
  );
}

for (const [roleName, privileges] of [
  ['farmacentroApi', API_ROLE_PRIVILEGES],
  ['auditReader', AUDIT_READER_PRIVILEGES],
] as const) {
  const wanted = toActions(privileges);
  const current = await atlas<{ actions?: RoleAction[] }>('GET', `${API}/customDBRoles/roles/${roleName}`);
  if (current.status === 404) {
    await atlas('POST', `${API}/customDBRoles/roles`, { roleName, actions: wanted, inheritedRoles: [] });
    console.log(`Rol ${roleName}: creado.`);
  } else if (signature(current.data?.actions) !== signature(wanted)) {
    await atlas('PATCH', `${API}/customDBRoles/roles/${roleName}`, { actions: wanted, inheritedRoles: [] });
    console.log(`Rol ${roleName}: corregido para que coincida con el código.`);
  } else {
    console.log(`Rol ${roleName}: ya coincide con el código.`);
  }
}

// ------------------------------------------------------------------------------------ cluster
const cluster = await atlas<{ connectionStrings?: { standardSrv?: string } }>('GET', `${API}/clusters/${clusterName}`);
const srv = cluster.data?.connectionStrings?.standardSrv;
if (cluster.status === 404 || !srv) {
  console.error(`No se encontró el clúster "${clusterName}" en el proyecto (define ATLAS_CLUSTER_NAME si tiene otro nombre).`);
  process.exit(1);
}
const host = srv.replace(/^mongodb\+srv:\/\//, '').replace(/\/.*$/, '');

// ------------------------------------------------------------------------------------- users
const USERS = [
  {
    username: 'farmacentro_migrator',
    roles: [
      { roleName: 'readWrite', databaseName: DB },
      { roleName: 'dbAdmin', databaseName: DB },
    ],
    envKeys: ['MONGODB_URI_ADMIN'],
  },
  {
    username: 'farmacentro_api',
    roles: [{ roleName: 'farmacentroApi', databaseName: 'admin' }],
    envKeys: ['MONGODB_URI', 'MONGODB_URI_API'],
  },
  {
    username: 'farmacentro_audit_reader',
    roles: [{ roleName: 'auditReader', databaseName: 'admin' }],
    envKeys: ['MONGODB_URI_AUDIT_READER'],
  },
];

const rotate = hasFlag('--rotate-passwords');
const newUris = new Map<string, string>();
for (const user of USERS) {
  const scopes = [{ name: clusterName, type: 'CLUSTER' }];
  const existing = await atlas('GET', `${API}/databaseUsers/admin/${user.username}`);
  // 40 URL-safe alphanumeric characters: no escaping needed inside the connection string.
  const password = randomBytes(40).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  if (existing.status === 404) {
    await atlas('POST', `${API}/databaseUsers`, {
      databaseName: 'admin',
      username: user.username,
      password,
      roles: user.roles,
      scopes,
    });
    console.log(`Usuario ${user.username}: creado.`);
  } else {
    await atlas('PATCH', `${API}/databaseUsers/admin/${user.username}`, {
      roles: user.roles,
      scopes,
      ...(rotate ? { password } : {}),
    });
    console.log(`Usuario ${user.username}: ya existía; roles verificados${rotate ? ' y contraseña renovada' : ''}.`);
    if (!rotate) continue; // password unknown: its connection string is left as it is
  }
  for (const key of user.envKeys) {
    newUris.set(key, `mongodb+srv://${user.username}:${password}@${host}/${DB}?retryWrites=true&w=majority&appName=${clusterName}`);
  }
}

// ------------------------------------------------------------------------------ access list
if (hasFlag('--add-my-ip')) {
  const ip = (await (await fetch('https://checkip.amazonaws.com')).text()).trim();
  await atlas('POST', `${API}/accessList`, [{ ipAddress: ip, comment: 'PC del equipo (atlas-provision)' }]);
  console.log(`Network Access: IP ${ip} agregada.`);
}

// ------------------------------------------------------------------------ .env.production
if (newUris.size > 0) {
  const envPath = path.join(ROOT, '.env.production');
  const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  for (const [key, uri] of newUris) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${uri}`;
    else lines.push(`${key}=${uri}`);
  }
  writeFileSync(envPath, `${lines.join('\n').trimEnd()}\n`);
  console.log(`Cadenas de conexión escritas en .env.production: ${[...newUris.keys()].join(', ')} (no se muestran).`);
  console.log('Copia MONGODB_URI de ese archivo a la variable MONGODB_URI de Render.');
}
