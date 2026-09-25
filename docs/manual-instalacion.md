# Manual de instalación

## 1. Requisitos

| Herramienta | Versión | Notas |
|---|---|---|
| Node.js | 22.12 o superior (probado con 22.16.0) | Con nvm: `nvm use 22.16.0` (ver `.nvmrc`) |
| npm | 10 o superior | Incluido con Node |
| Navegador | Chrome o Edge | WebAuthn con Windows Hello; Safari no acepta cookies `Secure` en `http://localhost` |
| MongoDB Atlas | Clúster M0 (gratuito) | O `npm run dev:db` solo para desarrollo |
| Correo de desarrollo | Docker (Mailpit) o `npm run dev:mail` | Para leer los códigos de 6 dígitos |

La primera ejecución de `npm test` o `npm run dev:db` descarga un binario de MongoDB (~780 MB) en la caché del usuario.

## 2. Instalación local

```bash
npm install
npm run generate-keys
```

1. Copia `server/.env.example` a `server/.env` y pega `SESSION_SECRET`, `DATA_ENC_KEY_V1`, `BLIND_INDEX_KEY` y `OTP_HMAC_KEY`.
2. Copia `scripts/.env.example` a `scripts/.env` y pega `BACKUP_ENC_KEY`.
3. Configura la base (sección 3) o, para desarrollo rápido, ejecuta `npm run dev:db` en otra terminal y usa la cadena que imprime en `MONGODB_URI` y `MONGODB_URI_ADMIN`.
4. Levanta el correo de desarrollo: `docker compose up -d` o `npm run dev:mail`.
5. Crea los índices y siembra los datos:
   ```bash
   npm run setup-db
   npm run seed
   ```
6. En dos terminales, `npm run dev:server` y `npm run dev:client`. Abre http://localhost:5173.

## 3. MongoDB Atlas (mínimo privilegio)

1. Crea un proyecto y un clúster **M0**. En **Network Access** agrega solo tu IP (o la del servidor de despliegue).
2. En **Database Access → Custom Roles** crea:
   - `farmacentroApi`, con las acciones por colección que imprime `npm run setup-db -- --print-role`. Las colecciones `audit_logs`, `inventory_movements`, `loyalty_transactions` y `dispensations` quedan **solo con `find` e `insert`**.
   - `auditReader`: solo `find` sobre `audit_logs`.
3. Crea tres usuarios de base de datos:

| Usuario | Rol | Dónde se usa |
|---|---|---|
| `farmacentro_migrator` | `readWrite` + `dbAdmin` sobre `farmacentro` | `scripts/.env` → `MONGODB_URI_ADMIN` |
| `farmacentro_api` | `farmacentroApi` | `server/.env` → `MONGODB_URI` y `scripts/.env` → `MONGODB_URI_API` |
| `farmacentro_audit_reader` | `auditReader` | `scripts/.env` → `MONGODB_URI_AUDIT_READER` (grupo auditor) |

4. Ejecuta `npm run setup-db` (índices, TTL y registro génesis) y `npm run seed`.
5. Genera la evidencia de privilegios: `npm run check-db-privileges`. Se guarda en `docs/evidencias/`.

Atlas M0 no ofrece respaldos automáticos: usa `npm run backup` y `npm run restore-test -- backups/<archivo>.bak`.

## 4. Despliegue (un solo origen con HTTPS)

La cookie `SameSite=Strict`, la CSP `'self'` y WebAuthn exigen que el cliente y la API compartan el **mismo dominio con HTTPS**. La API sirve el cliente compilado:

```bash
npm ci
npm run build
npm start
```

Variables de `server/.env` en producción:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SERVE_CLIENT` | `true` |
| `CLIENT_ORIGIN` | `https://<dominio>` |
| `RP_ID` | `<dominio>` (sin `https://` ni puerto) |
| `TRUST_PROXY` | `1` si hay un proxy o balanceador con TLS delante |
| `SMTP_*` | Un servidor SMTP real (los códigos deben llegar a correos reales) |
| `STEP_UP_ALLOW_EMAIL` | Según la decisión D-03 |

Para sembrar en producción define `SEED_PASSWORD` en `scripts/.env`: la contraseña de demostración es pública. Los usuarios deberán cambiarla al entrar.

Cuando la aplicación esté desplegada, pega el enlace en la sección **Despliegue** del `README.md`.

## 5. Verificación

```bash
npm test
npm run lint
npm run typecheck
npm run audit:check
npm run verify-audit
```
