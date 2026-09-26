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

Tus otras bases de datos locales siguen funcionando igual y MongoDB Compass se sigue conectando con `mongodb://localhost:27017/`. La cadena de conexión del backend (ya configurada en `.env`) es la misma de Compass con el nombre de la base:

```text
MONGODB_URI=mongodb://localhost:27017/farmacentro
```

La base `farmacentro` (colecciones, índices y registro génesis de la bitácora) se puede crear antes de activar el replica set con `npm run setup-db`; los datos de prueba y la API sí lo necesitan.

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

1. Crea un proyecto y un clúster **M0** en **AWS, N. Virginia (us-east-1)**: la misma región que el servicio de Render (`virginia`), para menor latencia.
2. **Network Access:** en Render, abre el servicio → **Connect → Outbound** y agrega esas IPs en Atlas. Si tu cuenta de Render no muestra IPs de salida fijas, agrega `0.0.0.0/0` y deja la protección en usuarios con contraseñas largas y TLS; esa excepción ya está declarada en `limitaciones-conocidas.md`. Agrega también tu IP para ejecutar los scripts desde tu PC.
3. En **Database Access → Custom Roles** crea:
   - `farmacentroApi`, con las acciones por colección que imprime `npm run setup-db -- --print-role`. Las colecciones `audit_logs`, `inventory_movements`, `loyalty_transactions` y `dispensations` quedan **solo con `find` e `insert`**.
   - `auditReader`: solo `find` sobre `audit_logs`.
4. Crea tres usuarios de base de datos, con contraseñas generadas por Atlas:

| Usuario | Rol | Dónde se usa |
|---|---|---|
| `farmacentro_migrator` | `readWrite` + `dbAdmin` sobre `farmacentro` | Solo en tu PC: `.env.production` → `MONGODB_URI_ADMIN` |
| `farmacentro_api` | `farmacentroApi` | Render → `MONGODB_URI`, y `.env.production` → `MONGODB_URI` y `MONGODB_URI_API` |
| `farmacentro_audit_reader` | `auditReader` | `.env.production` → `MONGODB_URI_AUDIT_READER` (y grupo auditor) |

La cadena de conexión de cada usuario es la que muestra Atlas en **Connect → Drivers**, con `/farmacentro` como base de datos antes del `?`.

**Alternativa por script (pasos 3 y 4 automáticos):**

1. En Atlas, entra a **Project → Access Manager → Service Accounts → Create Service Account**, con el rol **Project Owner**. Copia el *Client ID* y el *Client Secret* (el secreto se muestra una sola vez) y agrega tu IP en la lista de acceso a la API del service account.
2. Copia el *Project ID* (en **Project Settings**).
3. Pon `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET` y `ATLAS_PROJECT_ID` en `farmacentro-backend/.env.production`.
4. Ejecuta en `farmacentro-backend`:
   ```bash
   npm run atlas:provision -- --add-my-ip
   ```

El script crea (o corrige) los roles `farmacentroApi` y `auditReader` para que coincidan con `API_ROLE_PRIVILEGES` del código, crea los tres usuarios con contraseñas aleatorias limitadas al clúster, agrega tu IP y escribe las cuatro cadenas de conexión en `.env.production` sin mostrarlas. Si un usuario ya existía, solo verifica sus roles; con `--rotate-passwords` también le renueva la contraseña y actualiza su cadena.

Atlas M0 no ofrece respaldos automáticos: usa `npm run backup` y `npm run restore-test -- backups/<archivo>.bak`.

## 5. Despliegue: Netlify (frontend) + Render (backend) + Atlas

```text
Navegador ──HTTPS──> Netlify (farmacentro.netlify.app)
                       ├── /            → Farmacentro-Frontend/dist
                       └── /api/*       → proxy → Render (zero8-farmacentro-backend.onrender.com) ──TLS──> MongoDB Atlas
```

Netlify reenvía `/api/*` a Render. Así el navegador solo habla con el dominio de Netlify: la cookie de sesión sigue siendo `SameSite=Strict`, la CSP `'self'` y la huella (WebAuthn) usa el dominio de Netlify. Si el navegador llamara directo a Render, la cookie no viajaría y el login no funcionaría.

### 5.1 Antes de empezar

- **Nombre del sitio de Netlify:** decide uno libre, por ejemplo `farmacentro`. La URL será `https://farmacentro.netlify.app`; úsala en todos los pasos siguientes.
- **Brevo** (correo): crea una cuenta gratuita en brevo.com, verifica un **remitente** en *Senders, Domains & Dedicated IPs → Senders* (puede ser un Gmail del equipo) y genera una **API key** en *SMTP & API → API Keys*. Render gratis bloquea el SMTP, por eso los códigos salen por la API de Brevo.
- **Claves:** en `farmacentro-backend`, ejecuta `npm run generate-keys`. Esas mismas claves van en Render y en tu `.env.production`: si no coinciden, la API no podrá descifrar los datos cargados desde tu PC.

### 5.2 Preparar la base en Atlas (desde tu PC)

1. En `farmacentro-backend`, copia `.env.production.example` a `.env.production` (no se sube a Git) y complétalo: cadenas de Atlas, claves, Brevo, `CLIENT_ORIGIN`/`RP_ID` con la URL de Netlify, `SEED_PASSWORD` (privada, 12+ caracteres) y `SEED_EMAIL` (buzón real del equipo; cada usuario recibe sus códigos en `buzon+regente@…`, `buzon+cajero@…`, etc.).
2. Crea colecciones, índices y el registro génesis, y carga los datos de prueba:
   ```bash
   npm run setup-db:prod
   ```
   ```bash
   npm run seed:prod
   ```
3. Genera las evidencias para el grupo auditor:
   ```bash
   npm run check-db-privileges:prod
   ```
   ```bash
   npm run verify-audit:prod
   ```

### 5.3 Backend en Render

1. En Render: **New → Blueprint**, conecta el repositorio `ecaldcc/08-FarmaCentro` (rama `main`). Render lee `render.yaml` de la raíz: servicio `zero8-farmacentro-backend`, carpeta `farmacentro-backend`, build `npm ci --include=dev && npm run build`, arranque `npm start` y chequeo en `/api/health`.
2. Render pide los valores marcados como secretos. Usa los mismos de tu `.env.production`:

| Variable | Valor |
|---|---|
| `CLIENT_ORIGIN` | `https://farmacentro.netlify.app` |
| `RP_ID` | `farmacentro.netlify.app` |
| `MONGODB_URI` | Cadena de Atlas del usuario `farmacentro_api` |
| `SESSION_SECRET`, `DATA_ENC_KEY_V1`, `BLIND_INDEX_KEY`, `OTP_HMAC_KEY` | Las de `npm run generate-keys` |
| `BREVO_API_KEY` | La API key de Brevo |
| `MAIL_FROM` | `FarmaCentro <remitente-verificado@gmail.com>` |

   Los demás valores ya vienen en `render.yaml`: `NODE_ENV=production`, `MAIL_TRANSPORT=brevo`, `TRUST_PROXY=4`, `STEP_UP_ALLOW_EMAIL=true` (decisión D-03), Node 22.16.0.
3. Cuando termine el despliegue, abre `https://zero8-farmacentro-backend.onrender.com/api/health`: debe responder `{"status":"ok"}`. Si Render asignó otra URL (por ejemplo con un sufijo), cópiala para el paso siguiente.

### 5.4 Frontend en Netlify

1. Si la URL de Render no es `zero8-farmacentro-backend.onrender.com`, cámbiala en `Farmacentro-Frontend/netlify.toml` (regla `/api/*`) y sube el cambio.
2. En Netlify: **Add new site → Import an existing project**, elige el repositorio y configura **Base directory** = `Farmacentro-Frontend`. El comando (`npm run build`), la carpeta publicada (`dist`), la versión de Node, el proxy a Render y las cabeceras de seguridad (CSP, HSTS) se leen de `netlify.toml`.
3. En **Site configuration → Change site name**, pon el nombre elegido en 5.1 (`farmacentro`).
4. Abre `https://farmacentro.netlify.app`, inicia sesión con un usuario de prueba y confirma que el código llega al buzón de `SEED_EMAIL`.
5. Pega la URL en la sección **Despliegue** del `README.md`.

### 5.5 Qué tener en cuenta

- **Render gratis se duerme** tras 15 minutos sin tráfico y tarda de 30 a 60 segundos en despertar. El proxy de Netlify espera unos 26 segundos, así que la primera petición puede fallar: abre antes `https://zero8-farmacentro-backend.onrender.com/api/health` y espera la respuesta.
- **IP en la bitácora:** con `TRUST_PROXY=4` la API toma la IP del navegador. Entre el navegador y la API hay cuatro saltos de confianza: Netlify, Cloudflare (al frente de Render) y dos proxies internos de Render. Para comprobarlo, compara la IP que registra un intento de login fallido con la IP pública del equipo.
- **Credenciales del grupo auditor:** se entregan por un canal privado, nunca en el repositorio, junto con el ancla de la bitácora (`npm run verify-audit:prod`).

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
