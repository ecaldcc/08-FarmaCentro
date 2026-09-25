# Manual de instalación

El repositorio contiene dos proyectos independientes:

| Carpeta | Qué es | Comando de ejecución |
|---|---|---|
| `farmacentro-backend/` | API Express + TypeScript, scripts de base de datos y pruebas | `npm run dev` (puerto 3000) |
| `Farmacentro-Frontend/` | Cliente React + Vite | `npm run dev` (puerto 5173) |

## 1. Requisitos

| Herramienta | Versión | Notas |
|---|---|---|
| Node.js | 22.12 o superior (probado con 22.16.0) | Con nvm: `nvm use 22.16.0` |
| MongoDB | 8.x instalado en la PC (servicio de Windows) | Debe ejecutarse como **replica set** (sección 2) |
| Navegador | Chrome o Edge | WebAuthn con Windows Hello; Safari no acepta cookies `Secure` en `http://localhost` |

La primera ejecución de `npm test` descarga un binario de MongoDB (~780 MB) para las pruebas automáticas.

## 2. MongoDB local (replica set)

FarmaCentro usa **transacciones** para ventas, anulaciones y ajustes (CLAUDE.md, "Integridad"). MongoDB solo las permite en un replica set, y una instalación normal de Windows arranca como servidor único (standalone). Se configura **una sola vez**, en una PowerShell abierta **como administrador**:

1. Edita la configuración:
   ```bash
   notepad "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"
   ```
   Cambia la línea `#replication:` por estas dos (con dos espacios antes de `replSetName`) y guarda:
   ```yaml
   replication:
     replSetName: rs0
   ```
2. Reinicia el servicio:
   ```bash
   Restart-Service MongoDB
   ```
3. En una terminal normal, dentro de `farmacentro-backend`:
   ```bash
   npm run init-replica-set
   ```

Tus otras bases de datos locales siguen funcionando igual. La cadena de conexión queda así (ya configurada en `.env`):

```text
MONGODB_URI=mongodb://127.0.0.1:27017/farmacentro?replicaSet=rs0
```

Si el replica set no está activo, `npm run dev` se detiene y muestra estos mismos pasos.

## 3. Instalación y ejecución

**Backend** (terminal 1):

```bash
cd farmacentro-backend
npm install
npm run dev
```

- Si no existe `farmacentro-backend/.env`, cópialo de `.env.example` y completa `SESSION_SECRET`, `DATA_ENC_KEY_V1`, `BLIND_INDEX_KEY` y `OTP_HMAC_KEY` con la salida de `npm run generate-keys`.
- Antes de arrancar, `npm run dev` crea las colecciones e índices, y si la base está vacía carga los datos de prueba.
- Con `MAIL_TRANSPORT=console` (solo permitido en desarrollo), los códigos de verificación se muestran en esta terminal en lugar de enviarse por correo.

**Frontend** (terminal 2):

```bash
cd Farmacentro-Frontend
npm install
npm run dev
```

Abre http://localhost:5173. Vite reenvía `/api` al backend, así que el navegador ve un solo origen.

## 4. MongoDB Atlas (mínimo privilegio)

1. Crea un proyecto y un clúster **M0**. En **Network Access** agrega solo tu IP (o la del servidor de despliegue).
2. En **Database Access → Custom Roles** crea:
   - `farmacentroApi`, con las acciones por colección que imprime `npm run setup-db -- --print-role`. Las colecciones `audit_logs`, `inventory_movements`, `loyalty_transactions` y `dispensations` quedan **solo con `find` e `insert`**.
   - `auditReader`: solo `find` sobre `audit_logs`.
3. Crea tres usuarios de base de datos:

| Usuario | Rol | Dónde se usa |
|---|---|---|
| `farmacentro_migrator` | `readWrite` + `dbAdmin` sobre `farmacentro` | `scripts/.env` → `MONGODB_URI_ADMIN` |
| `farmacentro_api` | `farmacentroApi` | `.env` → `MONGODB_URI` y `scripts/.env` → `MONGODB_URI_API` |
| `farmacentro_audit_reader` | `auditReader` | `scripts/.env` → `MONGODB_URI_AUDIT_READER` (grupo auditor) |

4. Ejecuta `npm run setup-db` y `npm run seed`. Genera la evidencia de privilegios con `npm run check-db-privileges`; se guarda en `docs/evidencias/`.

Atlas M0 no ofrece respaldos automáticos: usa `npm run backup` y `npm run restore-test -- backups/<archivo>.bak`.

## 5. Despliegue (un solo origen con HTTPS)

La cookie `SameSite=Strict`, la CSP `'self'` y WebAuthn exigen que el cliente y la API compartan el **mismo dominio con HTTPS**. Se compila el frontend y lo sirve el backend:

```bash
cd Farmacentro-Frontend
npm ci
npm run build
```

```bash
cd farmacentro-backend
npm ci
npm run build
npm start
```

Variables de `farmacentro-backend/.env` en producción:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SERVE_CLIENT` | `true` (usa `../Farmacentro-Frontend/dist`; otra ruta con `CLIENT_DIST`) |
| `CLIENT_ORIGIN` | `https://<dominio>` |
| `RP_ID` | `<dominio>` (sin `https://` ni puerto) |
| `TRUST_PROXY` | `1` si hay un proxy o balanceador con TLS delante |
| `MAIL_TRANSPORT` | `smtp`, con un servidor SMTP real (`console` no está permitido en producción) |
| `STEP_UP_ALLOW_EMAIL` | Según la decisión D-03 |

Para sembrar en producción define `SEED_PASSWORD` en `scripts/.env`: la contraseña de demostración es pública. Cuando la aplicación esté desplegada, pega el enlace en la sección **Despliegue** del `README.md`.

## 6. Verificación

En `farmacentro-backend`:

```bash
npm test
npm run lint
npm run typecheck
npm run audit:check
npm run verify-audit
```

En `Farmacentro-Frontend`:

```bash
npm run lint
npm run typecheck
```
