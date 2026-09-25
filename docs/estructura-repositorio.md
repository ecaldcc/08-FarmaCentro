# Estructura del repositorio y dependencias

> Versión actual (25/09/2026). Controles relacionados: 8.4, 8.8, 8.25, 8.27, 8.31, 8.32.

## 1. Organización general

- El repositorio contiene **dos proyectos totalmente separados**: `farmacentro-backend/` (API) y `Farmacentro-Frontend/` (cliente web). Cada uno tiene su `package.json`, su `package-lock.json` versionado, su `eslint.config.js` y su comando `npm run dev`. No hay nada que instalar ni ejecutar en la raíz.
- La documentación y las evidencias para el grupo auditor están en `docs/`.
- Entorno: **Node.js 22.16.0** (archivo `.nvmrc`). Las variables de entorno se cargan con `--env-file` y `process.loadEnvFile` de Node, sin la dependencia `dotenv`.
- `.npmrc` con `save-exact=true` en cada proyecto: las versiones quedan fijas (sin `^`), así cada actualización es un cambio explícito y revisable.
- Base de datos en desarrollo: MongoDB local configurado como replica set `rs0` (necesario para transacciones), con la misma conexión que MongoDB Compass (`mongodb://localhost:27017/`). Para la entrega: MongoDB Atlas.

```text
Farmacentro/
├── .editorconfig
├── .gitattributes
├── .gitignore                  # .env, node_modules, dist, coverage, backups, .claude
├── .nvmrc                      # 22.16.0
├── CLAUDE.md                   # reglas del proyecto
├── README.md                   # descripción, despliegue y cómo ejecutarlo
│
├── farmacentro-backend/
│   ├── .env.example            # nombres de variables sin valores reales (§3)
│   ├── .npmrc
│   ├── eslint.config.js        # TypeScript + eslint-plugin-security
│   ├── package.json            # npm run dev (predev prepara la base), test, lint, scripts de BD
│   ├── tsconfig.json / tsconfig.build.json
│   ├── vitest.config.ts
│   ├── scripts/
│   │   ├── .env.example        # conexiones privilegiadas (opcionales en desarrollo) y clave de respaldos
│   │   ├── lib/env.ts          # carga de .env y rutas del repositorio
│   │   ├── lib/seedData.ts     # datos ficticios de prueba
│   │   ├── setup-db.ts         # colecciones, índices, TTL y registro génesis; con --seed-if-empty carga datos
│   │   ├── seed.ts             # datos de prueba (--reset los vuelve a cargar)
│   │   ├── init-replica-set.ts # activa el replica set rs0 del MongoDB local
│   │   ├── generate-keys.ts    # imprime claves aleatorias para .env (no las guarda)
│   │   ├── verify-audit-chain.ts
│   │   ├── check-db-privileges.ts
│   │   ├── backup.ts / restore-test.ts
│   │   └── audit-report.ts     # npm audit de ambos proyectos + evidencia
│   ├── src/
│   │   ├── index.ts            # arranque: conexión, verificación del replica set, servidor
│   │   ├── app.ts              # cadena de middlewares (arquitectura.md §4)
│   │   ├── config/             # env (validado con Zod), db, session, logger
│   │   ├── db/                 # schema.ts (índices y privilegios del rol de la API), replicaSet.ts
│   │   ├── domain/             # roles, acciones de bitácora, acciones de re-autenticación, NIT/DPI
│   │   ├── middlewares/        # origen, auth, roles, validación, re-autenticación, límites, errores
│   │   ├── routes/             # auth, users, inventory, sales (incluye clientes, recetas y facturación), audit
│   │   ├── controllers/
│   │   ├── services/           # negocio, cifrado, bitácora, correo, OTP, WebAuthn, facturación, reportes
│   │   ├── models/             # un archivo por colección (modelo-datos.md)
│   │   ├── validation/         # esquemas Zod por módulo
│   │   ├── data/               # contraseñas prohibidas y aviso de privacidad
│   │   ├── types/              # tipado de la sesión y del request
│   │   └── utils/
│   └── tests/
│       ├── globalSetup.ts / setup.ts   # MongoDB en memoria (replica set) y configuración de prueba
│       ├── helpers/            # cliente HTTP, datos de prueba y autenticador WebAuthn por software
│       ├── auth/               # login con código y con huella
│       ├── modules/            # inventario, ventas, clientes, recetas y facturación
│       └── security/           # inyección NoSQL, roles, bloqueo, sesión, bitácora, web, cifrado, límites
│
├── Farmacentro-Frontend/
│   ├── .npmrc
│   ├── eslint.config.js        # prohíbe dangerouslySetInnerHTML y localStorage/sessionStorage
│   ├── index.html
│   ├── package.json            # npm run dev (Vite, puerto 5173)
│   ├── tsconfig.json
│   ├── vite.config.ts          # proxy /api → http://localhost:3000; sin sourcemaps en build
│   ├── public/favicon.svg
│   └── src/
│       ├── main.tsx / App.tsx  # rutas por rol (pantallas.md)
│       ├── api/                # cliente HTTP (cookie de sesión) y tipos
│       ├── auth/               # sesión en memoria, re-autenticación, aviso de inactividad, WebAuthn
│       ├── components/         # Layout, ui, PaymentModal (cobro y facturación), QuantityInput
│       ├── pages/              # login, account, users, pos, sales, customers, prescriptions,
│       │                       # inventory, audit, reports, errors
│       ├── styles/app.css      # CSS servido como archivo (compatible con la CSP)
│       └── utils/              # formatos y validación de NIT/DPI
│
└── docs/
    ├── entregable2-modelo-seguridad.md
    ├── arquitectura.md · modelo-datos.md · roles-permisos.md · api.md · pantallas.md
    ├── matriz-controles.md · estructura-repositorio.md · decisiones-pendientes.md
    ├── manual-instalacion.md · credenciales-prueba.md · limitaciones-conocidas.md
    └── evidencias/             # npm audit, privilegios de BD, pruebas de restauración
```

## 2. Dependencias

Versiones fijas (consultadas en el registro de npm el 24/09/2026). `npm audit` no reporta vulnerabilidades en ninguno de los dos proyectos (`docs/evidencias/`).

### 2.1 `farmacentro-backend` — producción

| Paquete | Versión | Para qué | Requisito que atiende |
|---|---|---|---|
| `express` | 5.2.1 | Servidor HTTP; captura errores de funciones `async` | Stack |
| `express-session` | 1.19.0 | Sesión en el servidor con cookie firmada | 5.17, 8.5 |
| `connect-mongo` | 6.0.0 | Guarda las sesiones en MongoDB (`sessions`) | Sesión en servidor |
| `mongoose` | 9.10.2 | ODM; `sanitizeFilter`, `strictQuery`, transacciones | 8.28, integridad |
| `zod` | 4.6.5 | Validación de toda entrada de la API y de las variables de entorno | 8.28 |
| `helmet` | 8.3.0 | Cabeceras de seguridad y Content Security Policy | Seguridad web |
| `cors` | 2.8.6 | CORS restringido a `CLIENT_ORIGIN` | Seguridad web |
| `express-rate-limit` | 8.7.0 | Límite de peticiones en login y envío de códigos | 8.5 |
| `bcrypt` | 6.0.0 | Hash de contraseñas, costo 12 | 5.17 |
| `@simplewebauthn/server` | 14.0.2 | Generar y verificar desafíos WebAuthn | 8.5 |
| `nodemailer` | 10.0.10 | Envío de códigos y avisos | 8.5, 8.16 |
| `pino` / `pino-http` | 10.3.1 / 11.0.0 | Log técnico con redacción de secretos | 8.15 |
| `csv-stringify` | 6.8.3 | Exportaciones CSV | Reportes |

AES-256-GCM, HMAC, SHA-256 y los números aleatorios salen de `node:crypto`, sin dependencias extra.

### 2.2 `farmacentro-backend` — desarrollo y pruebas

| Paquete | Versión | Para qué |
|---|---|---|
| `typescript` | 6.0.3 | Compilador (la 7 aún no es compatible con `typescript-eslint`) |
| `tsx` | 4.23.15 | Ejecutar TypeScript en desarrollo y en `scripts/` |
| `vitest` / `supertest` | 5.0.1 / 7.3.0 | Pruebas de la API |
| `mongodb-memory-server` | 11.3.0 | MongoDB en memoria (replica set) para las pruebas |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-security`, `globals` | 10.11.0, 10.0.1, 8.70.1, 4.0.1, 17.12.0 | Calidad y patrones inseguros |
| `@types/*` | — | Tipos de Node 22, Express, sesión, CORS, bcrypt, Nodemailer y Supertest |

### 2.3 `Farmacentro-Frontend`

| Paquete | Versión | Tipo | Para qué |
|---|---|---|---|
| `react` / `react-dom` | 19.3.0 | prod | Interfaz |
| `react-router` | 7.18.4 | prod | Navegación por rol |
| `@simplewebauthn/browser` | 14.0.0 | prod | WebAuthn desde el navegador |
| `vite` / `@vitejs/plugin-react` | 8.3.1 / 6.1.1 | dev | Servidor de desarrollo con proxy y compilación |
| `typescript` | 6.0.3 | dev | Compilador |
| `eslint` y plugins (incluye `eslint-plugin-react-hooks` 7.1.1) | — | dev | Calidad y reglas de seguridad del cliente |

Se evitan librerías de componentes, de estado global y de peticiones: menos dependencias, menos superficie para `npm audit` y para el grupo auditor.

## 3. Variables de entorno

`farmacentro-backend/.env.example` (solo nombres y descripción; los valores reales nunca se versionan):

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `development` · `test` · `production` |
| `PORT` | Puerto de la API (3000) |
| `CLIENT_ORIGIN` | Origen exacto del cliente (`http://localhost:5173` en desarrollo) |
| `TRUST_PROXY` | Número de saltos de proxy (0 en local) |
| `MONGODB_URI` | `mongodb://localhost:27017/farmacentro` en local; usuario `farmacentro_api` en Atlas |
| `SESSION_SECRET`, `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS` | Sesión (inactividad máxima de 15 min, absoluta de 8 h) |
| `DATA_ENC_ACTIVE_VERSION`, `DATA_ENC_KEY_V1` | Clave AES-256-GCM (32 bytes en base64) y su versión |
| `BLIND_INDEX_KEY`, `OTP_HMAC_KEY` | Claves HMAC para índices ciegos y códigos |
| `BCRYPT_COST` | 12 como mínimo |
| `RP_ID`, `RP_NAME` | Dominio y nombre para WebAuthn |
| `MAIL_TRANSPORT`, `SMTP_*`, `MAIL_FROM` | `console` en desarrollo (los códigos se ven en la terminal); `smtp` fuera de desarrollo |
| `STEP_UP_ALLOW_EMAIL` | Si el código por correo sirve para re-autenticación (D-03) |
| `SERVE_CLIENT`, `CLIENT_DIST` | Servir el frontend compilado desde la API (un solo origen) |
| `LOG_LEVEL` | `info` por defecto |

`farmacentro-backend/scripts/.env.example`: `MONGODB_URI_ADMIN`, `MONGODB_URI_API`, `MONGODB_URI_AUDIT_READER` (opcionales en desarrollo, obligatorias con Atlas), `BACKUP_ENC_KEY` y `SEED_PASSWORD`.

## 4. Comandos

| Proyecto | Comando | Qué hace |
|---|---|---|
| Backend | `npm run dev` | Prepara la base (índices y, si está vacía, datos de prueba) y levanta la API con recarga automática |
| Backend | `npm test` · `npm run lint` · `npm run typecheck` | Pruebas y calidad |
| Backend | `npm run seed -- --reset` | Vuelve a cargar los datos de prueba |
| Backend | `npm run init-replica-set` | Activa el replica set del MongoDB local |
| Backend | `npm run audit:check` · `npm run verify-audit` · `npm run check-db-privileges` | Evidencias para la auditoría |
| Backend | `npm run backup` · `npm run restore-test` | Respaldo cifrado y prueba de restauración |
| Frontend | `npm run dev` | Vite en http://localhost:5173 |
| Frontend | `npm run build` · `npm run lint` · `npm run typecheck` | Compilación y calidad |

## 5. Ramas

`main` (estable) ← `develop` ← ramas por módulo (`feat/auth`, `feat/inventory`, `feat/sales`, `feat/audit-reports`, `feat/scripts`, `feat/client`, `feat/billing`, `chore/security-tests`, `refactor/split-projects`). Commits pequeños en inglés. Repositorio: https://github.com/ecaldcc/08-FarmaCentro
