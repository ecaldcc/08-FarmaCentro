# Estructura del repositorio y dependencias

> Documento de diseño (versión inicial, 24/09/2026). Controles: 8.4, 8.8, 8.25, 8.27, 8.31, 8.32.

## 1. Organización general

- Un solo repositorio con **npm workspaces** (`client`, `server`) y **un solo `package-lock.json` en la raíz**, versionado.
- `scripts/` no es un workspace: sus archivos se ejecutan con `tsx` desde la raíz y reutilizan los modelos de `server/src/models` (así la siembra y la API usan los mismos esquemas).
- Entorno: **Node.js 24 LTS** (archivo `.nvmrc`). El Node 20.19.4 instalado en esta máquina terminó su soporte en abril de 2026 y no es compatible con Vitest 5 ni con React Router 8 (ver D-04).
- `.npmrc` con `save-exact=true`: las versiones quedan fijas (sin `^`), así cada actualización es un cambio explícito y revisable.

```text
Farmacentro/
├── .editorconfig
├── .gitignore                  # .env, .env.*, !.env.example, node_modules, dist, coverage, *.log, backups/
├── .npmrc                      # save-exact=true, audit-level=high
├── .nvmrc                      # 24
├── CLAUDE.md
├── README.md                   # instalación rápida; SIN credenciales (van en docs/credenciales-prueba.md)
├── eslint.config.js            # reglas TS + security + react-hooks; prohíbe dangerouslySetInnerHTML y eval
├── package.json                # workspaces, scripts de raíz (lint, test, audit:check, seed, setup-db, verify-audit)
├── package-lock.json
│
├── client/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts          # proxy /api → http://localhost:3000 en desarrollo; sin sourcemaps en build
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── router.tsx          # rutas por rol (pantallas.md)
│       ├── api/
│       │   ├── http.ts         # fetch con credentials:'same-origin', JSON, manejo 401 / 403 STEP_UP_REQUIRED
│       │   ├── auth.api.ts
│       │   ├── users.api.ts
│       │   ├── products.api.ts
│       │   ├── inventory.api.ts
│       │   ├── sales.api.ts
│       │   ├── customers.api.ts
│       │   ├── prescriptions.api.ts
│       │   ├── audit.api.ts
│       │   └── reports.api.ts
│       ├── auth/
│       │   ├── AuthProvider.tsx        # usuario en memoria (nunca en localStorage/sessionStorage)
│       │   ├── RequireRole.tsx         # oculta rutas; la API decide de verdad
│       │   ├── StepUpProvider.tsx      # modal C6 de re-autenticación
│       │   ├── useInactivityWarning.ts # aviso a los 13 min
│       │   └── webauthn.ts             # envoltura de @simplewebauthn/browser
│       ├── components/         # Layout, Sidebar, DataTable, ReasonDialog, MoneyInput, DateRangePicker…
│       ├── pages/
│       │   ├── login/          # C1, C2, C3
│       │   ├── account/        # C4, C5
│       │   ├── users/          # A1–A3
│       │   ├── pos/            # K1, K2, K3
│       │   ├── sales/          # R2, R3, K7
│       │   ├── customers/      # K4–K6, R12
│       │   ├── prescriptions/  # R4–R6
│       │   ├── inventory/      # B1–B7, R7–R11
│       │   ├── audit/          # U1, U2
│       │   ├── reports/        # A4, B8, R13, U3
│       │   └── errors/         # C8, C9
│       ├── styles/             # CSS Modules (sin CSS-in-JS que inyecte <style>, por la CSP)
│       └── utils/              # format.ts (quetzales, fechas locales), mask.ts
│
├── server/
│   ├── .env.example            # nombres de variables sin valores reales (§3)
│   ├── package.json
│   ├── tsconfig.json           # strict, noUncheckedIndexedAccess
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts            # arranque: valida env, conecta a Atlas, escucha el puerto
│   │   ├── app.ts              # construye la app Express (cadena de middlewares de arquitectura.md §4)
│   │   ├── config/
│   │   │   ├── env.ts          # valida process.env con Zod; si falta algo, no arranca
│   │   │   ├── db.ts           # mongoose.set('sanitizeFilter'|'strictQuery'), autoIndex:false, TLS
│   │   │   ├── session.ts      # express-session + connect-mongo
│   │   │   ├── security.ts     # helmet (CSP), cors
│   │   │   ├── webauthn.ts     # RP_ID, RP_NAME, origen esperado
│   │   │   ├── mail.ts         # transporte de Nodemailer
│   │   │   └── logger.ts       # pino con redacción
│   │   ├── domain/
│   │   │   ├── roles.ts        # roles y permisos (fuente única de roles-permisos.md)
│   │   │   ├── auditActions.ts # catálogo de eventos
│   │   │   └── stepUpActions.ts
│   │   ├── middlewares/
│   │   │   ├── requestId.ts
│   │   │   ├── verifyOrigin.ts
│   │   │   ├── loadUser.ts
│   │   │   ├── requireAuth.ts
│   │   │   ├── requireRole.ts
│   │   │   ├── requireStepUp.ts
│   │   │   ├── validate.ts     # Zod → req.validated
│   │   │   ├── rateLimits.ts
│   │   │   ├── notFound.ts
│   │   │   └── errorHandler.ts # respuestas genéricas, sin stack
│   │   ├── routes/             # *.routes.ts por módulo (api.md)
│   │   ├── controllers/        # *.controller.ts por módulo
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── password.service.ts
│   │   │   ├── webauthn.service.ts
│   │   │   ├── otp.service.ts
│   │   │   ├── stepUp.service.ts
│   │   │   ├── user.service.ts
│   │   │   ├── product.service.ts
│   │   │   ├── inventory.service.ts
│   │   │   ├── sale.service.ts
│   │   │   ├── customer.service.ts
│   │   │   ├── prescription.service.ts
│   │   │   ├── audit.service.ts        # encadenamiento y verificación
│   │   │   ├── report.service.ts
│   │   │   ├── crypto.service.ts       # AES-256-GCM, HMAC de índices ciegos
│   │   │   ├── notification.service.ts # correos de aviso
│   │   │   └── csv.service.ts          # CSV con protección contra inyección de fórmulas
│   │   ├── models/             # un archivo por colección de modelo-datos.md + encryptedField.ts
│   │   ├── validation/         # common.ts + *.schemas.ts por módulo
│   │   ├── data/
│   │   │   ├── common-passwords.txt    # lista de contraseñas prohibidas (D-20)
│   │   │   └── privacy-notice.ts       # texto y versión del aviso de privacidad
│   │   ├── types/express-session.d.ts  # tipado de req.session
│   │   └── utils/              # canonicalJson.ts, mask.ts, money.ts, httpError.ts, escapeRegex.ts
│   └── tests/
│       ├── setup.ts            # MongoMemoryReplSet (transacciones), transporte de correo en memoria
│       ├── helpers/
│       │   ├── agent.ts        # supertest.agent con cookie y Origin
│       │   ├── softAuthenticator.ts  # autenticador WebAuthn por software, SOLO para pruebas
│       │   └── factories.ts
│       ├── auth/               # login, OTP, WebAuthn, cambio de contraseña
│       ├── modules/            # users, products, inventory, sales, customers, prescriptions, reports
│       └── security/
│           ├── nosql-injection.test.ts
│           ├── rbac.test.ts
│           ├── lockout.test.ts
│           ├── session.test.ts          # expiración por inactividad, regeneración de id
│           ├── step-up.test.ts          # un solo uso, ligado a acción y registro, vencimiento
│           ├── audit-tamper.test.ts     # alteración detectada + usuario sin update/delete
│           ├── origin.test.ts
│           ├── headers.test.ts          # CSP, cookies, sin X-Powered-By
│           ├── errors.test.ts           # sin stack traces
│           ├── crypto.test.ts           # IV único, AAD, manipulación detectada
│           ├── otp.test.ts
│           ├── password-policy.test.ts
│           └── prescriptions-access.test.ts
│
├── scripts/
│   ├── .env.example            # MONGODB_URI_ADMIN, MONGODB_URI_API, MONGODB_URI_AUDIT_READER
│   ├── tsconfig.json
│   ├── generate-keys.ts        # imprime claves aleatorias para server/.env (no las guarda)
│   ├── setup-db.ts             # crea colecciones, índices y TTL con el usuario migrator; registro génesis
│   ├── seed.ts                 # datos ficticios y un usuario por rol
│   ├── check-db-privileges.ts  # evidencia: el usuario de la API no puede update/delete en audit_logs
│   ├── verify-audit-chain.ts   # verificación independiente de la cadena (usuario audit_reader)
│   ├── backup.ts               # exportación cifrada (D-18)
│   └── restore-test.ts         # restauración en base local y comparación de conteos
│
└── docs/
    ├── entregable2-modelo-seguridad.md
    ├── arquitectura.md
    ├── modelo-datos.md
    ├── roles-permisos.md
    ├── api.md
    ├── pantallas.md
    ├── matriz-controles.md
    ├── estructura-repositorio.md
    ├── decisiones-pendientes.md
    ├── credenciales-prueba.md          # sprint 1 (solo datos ficticios)
    ├── manual-instalacion.md           # sprint 4
    ├── diccionario-datos.md            # sprint 4 (derivado de modelo-datos.md)
    ├── limitaciones-conocidas.md       # sprint 4
    ├── reglas-auditoria.md             # sprint 4
    └── evidencias/                     # npm audit, resultados de pruebas, capturas de Atlas
```

## 2. Dependencias propuestas

Versiones consultadas en el registro de npm (`npm view`) el 24/09/2026. Todavía no se instalaron ni se pasó `npm audit`; eso será parte del sprint 1.

### 2.1 `server` — producción

| Paquete | Versión | Para qué | Requisito que atiende |
|---|---|---|---|
| `express` | 5.2.1 | Servidor HTTP; la v5 captura errores de funciones `async` | Stack |
| `express-session` | 1.19.0 | Sesión en el servidor con cookie firmada | 5.17, 8.5 |
| `connect-mongo` | 6.0.0 | Guarda las sesiones en MongoDB (`sessions`) | Sesión en servidor |
| `mongoose` | 9.10.2 | ODM; `sanitizeFilter`, `strictQuery`, transacciones | 8.28, integridad |
| `zod` | 4.6.5 | Validación de toda entrada de la API y de las variables de entorno | 8.28 |
| `helmet` | 8.3.0 | Cabeceras de seguridad y Content Security Policy | Seguridad web |
| `cors` | 2.8.6 | CORS restringido a `CLIENT_ORIGIN` | Seguridad web |
| `express-rate-limit` | 8.7.0 | Límite de peticiones en login y envío de códigos | 8.5 |
| `bcrypt` | 6.0.0 | Hash de contraseñas, costo 12 (alternativa `bcryptjs` 3.0.3, ver D-05) | 5.17 |
| `@simplewebauthn/server` | 14.0.2 | Generar y verificar desafíos WebAuthn | 8.5 |
| `nodemailer` | 10.0.10 | Envío de códigos y avisos | 8.5, 8.16 |
| `dotenv` | 18.0.3 | Carga de `.env` | 8.24 (secretos fuera del código) |
| `pino` | 10.3.1 | Log técnico estructurado con redacción de secretos | 8.15 |
| `pino-http` | 11.0.0 | Log por petición con `requestId` | 8.15 |
| `csv-stringify` | 6.8.3 | Generación de CSV para exportaciones | Reportes |

Sin dependencia extra para criptografía: AES-256-GCM, HMAC, SHA-256 y números aleatorios salen de `node:crypto`.

### 2.2 `server` — desarrollo y pruebas

| Paquete | Versión | Para qué |
|---|---|---|
| `typescript` | 6.0.3 | Compilador. **No** la 7.0.2: `typescript-eslint` 8.70.1 solo admite `<6.1.0` (D-04) |
| `tsx` | 4.23.15 | Ejecutar TypeScript en desarrollo y en `scripts/` |
| `vitest` | 5.0.1 | Pruebas (requiere Node 22.12+ o 24) |
| `supertest` | 7.3.0 | Pruebas HTTP de la API |
| `mongodb-memory-server` | 11.3.0 | MongoDB en memoria como conjunto de réplicas (para probar transacciones y roles sin tocar Atlas) |
| `@types/node` | 24.13.6 | Tipos de Node 24 |
| `@types/express` | 5.0.6 | Tipos |
| `@types/express-session` | 1.19.0 | Tipos |
| `@types/cors` | 2.8.19 | Tipos |
| `@types/bcrypt` | 6.0.0 | Tipos |
| `@types/nodemailer` | 8.0.2 | Tipos |
| `@types/supertest` | 7.2.1 | Tipos |

### 2.3 `client`

| Paquete | Versión | Tipo | Para qué |
|---|---|---|---|
| `react` | 19.3.0 | prod | Interfaz |
| `react-dom` | 19.3.0 | prod | Renderizado |
| `react-router` | 8.4.0 | prod | Navegación por rol (modo declarativo, sin SSR) |
| `@simplewebauthn/browser` | 14.0.0 | prod | Llamar a WebAuthn desde el navegador (misma versión mayor que el servidor) |
| `vite` | 8.3.1 | dev | Servidor de desarrollo con proxy y compilación |
| `@vitejs/plugin-react` | 6.1.1 | dev | Soporte de React en Vite |
| `typescript` | 6.0.3 | dev | Compilador |
| `@types/react` / `@types/react-dom` | 19.3.0 | dev | Tipos |

Se evitan a propósito librerías de componentes, de estado global y de peticiones (p. ej. React Query): menos dependencias = menos superficie para `npm audit` y para el grupo auditor.

### 2.4 Raíz — calidad de código

| Paquete | Versión | Para qué |
|---|---|---|
| `eslint` | 10.11.0 | Linter |
| `@eslint/js` | 10.0.1 | Reglas base |
| `typescript-eslint` | 8.70.1 | Reglas para TypeScript |
| `eslint-plugin-security` | 4.0.1 | Detecta patrones inseguros (eval, regex peligrosas, rutas dinámicas) |
| `eslint-plugin-react-hooks` | 7.1.1 | Reglas de hooks (compatibilidad con ESLint 10 por confirmar al instalar) |
| `globals` | 17.12.0 | Globales de navegador y Node para ESLint |
| `prettier` | 3.9.9 | Formato |

### 2.5 Herramientas externas (no son dependencias de npm)

| Herramienta | Para qué |
|---|---|
| MongoDB Atlas (M0) | Base de datos |
| Servidor SMTP de desarrollo | Recibir los correos de prueba (D-06) |
| Chrome o Edge con Windows Hello | WebAuthn en `localhost` |
| MongoDB Database Tools (`mongodump`/`mongorestore`) | Solo si se elige esa vía para el respaldo simulado (D-18) |

## 3. Variables de entorno

`server/.env.example` (solo nombres y descripción; los valores reales nunca se versionan):

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `development` · `test` · `production` |
| `PORT` | Puerto de la API (3000) |
| `CLIENT_ORIGIN` | Origen exacto del cliente (`http://localhost:5173` en desarrollo) — CORS, verificación de origen y WebAuthn |
| `TRUST_PROXY` | Número de saltos de proxy (0 en local) |
| `MONGODB_URI` | Cadena de conexión del usuario `farmacentro_api` |
| `SESSION_SECRET` | ≥ 32 bytes aleatorios |
| `DATA_ENC_ACTIVE_VERSION` | Versión de clave con la que se cifra (1) |
| `DATA_ENC_KEY_V1` | 32 bytes en base64 (AES-256-GCM) |
| `BLIND_INDEX_KEY` | 32 bytes en base64 (HMAC de índices ciegos) |
| `OTP_HMAC_KEY` | 32 bytes en base64 (HMAC de códigos) |
| `RP_ID` / `RP_NAME` | Dominio de WebAuthn (`localhost`) y nombre visible ("FarmaCentro") |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Servidor de correo |
| `STEP_UP_ALLOW_EMAIL` | `true`/`false`: si el código por correo sirve para re-autenticación (D-03) |
| `LOG_LEVEL` | `info` por defecto |

`scripts/.env.example`: `MONGODB_URI_ADMIN` (usuario `farmacentro_migrator`), `MONGODB_URI_API` (para `check-db-privileges.ts`), `MONGODB_URI_AUDIT_READER`. Los scripts leen además las claves de cifrado de `server/.env` para sembrar recetas cifradas.

## 4. Scripts npm previstos (raíz)

| Script | Qué hace |
|---|---|
| `npm run dev` | API (`tsx watch`) y cliente (Vite) en dos procesos |
| `npm run build` | Compila cliente y servidor |
| `npm test` | Pruebas de la API (Vitest + Supertest + memoria) |
| `npm run lint` | ESLint en todo el repositorio |
| `npm run audit:check` | `npm audit --audit-level=high`; falla si hay altas o críticas y guarda el resultado en `docs/evidencias/` |
| `npm run setup-db` | `scripts/setup-db.ts` |
| `npm run seed` | `scripts/seed.ts` |
| `npm run verify-audit` | `scripts/verify-audit-chain.ts` |
| `npm run check-db-privileges` | `scripts/check-db-privileges.ts` |

## 5. Ramas

`main` (estable) ← `develop` ← ramas por módulo: `feat/auth`, `feat/users-roles`, `feat/audit-log`, `feat/inventory`, `feat/sales`, `feat/customers`, `feat/prescriptions`, `feat/reports`, `chore/security-tests`. Commits pequeños en inglés (p. ej. `feat(audit): add hash chain verification`). Fusión a `develop` con revisión de otro integrante.
