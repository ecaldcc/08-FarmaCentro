# 08-FarmaCentro — Sistema de gestión seguro y auditable

Prototipo académico del curso **Seguridad y Auditoría de Sistemas** (Universidad Mariano Gálvez de Guatemala, Sección A, Ing. Omar Eduardo Sagastume Álvarez).

**Equipo:** Edwar Daniel Calderón Cinco · José Eduardo Salguero Aquino · Henry David Cabrera Virula

---

## Despliegue

| | |
|---|---|
| **Aplicación en línea** | **Pendiente de despliegue** — pegar aquí el enlace de Netlify |
| **Frontend** | Netlify (`Farmacentro-Frontend`, configurado en `netlify.toml`) |
| **Backend (API)** | Render (`farmacentro-backend`, configurado en `render.yaml`) |
| **Base de datos** | MongoDB Atlas M0 (AWS N. Virginia) |
| **Repositorio** | [github.com/ecaldcc/08-FarmaCentro](https://github.com/ecaldcc/08-FarmaCentro) |
| **Estado** | Configuración lista · pendiente de crear los servicios y entregar al grupo auditor |

> **Cómo está armado:** Netlify sirve el cliente y reenvía `/api/*` a Render, así el navegador solo ve un dominio con HTTPS: la cookie de sesión sigue siendo `SameSite=Strict` y la huella (WebAuthn) funciona. Los correos salen por la API de Brevo, porque Render gratis bloquea el SMTP. Paso a paso en [docs/manual-instalacion.md](docs/manual-instalacion.md#5-despliegue-netlify-frontend--render-backend--atlas).

---

> **Sistema académico:** usa **solo datos ficticios**. Los pagos son simulados y nunca se pide ni se guarda un dato de tarjeta.

## Qué es

FarmaCentro es una cadena ficticia de farmacias pyme en Guatemala. Esta aplicación web es su sistema de gestión de sucursal: ventas de mostrador con facturación a CF, NIT o DPI, inventario con medicamentos controlados, clientes de fidelización, recetas y bitácora de auditoría.

Se diseñó a partir del modelo de seguridad basado en **ISO/IEC 27001:2022** (ver [docs/entregable2-modelo-seguridad.md](docs/entregable2-modelo-seguridad.md)), con dos objetivos: que sea **seguro** y que sea **fácil de auditar**. Cada control deja evidencia verificable: un registro en la bitácora, una configuración, una prueba automática o un documento. Otro grupo del curso lo auditará como auditor independiente.

## Funciones principales

| Módulo | Qué hace | Controles de seguridad destacados |
|---|---|---|
| Autenticación | Usuario y contraseña + **segundo factor**: huella (WebAuthn / Windows Hello) o código de 6 dígitos por correo | bcrypt (costo 12), bloqueo de 15 min tras 5 intentos, sesión en servidor que expira a los 15 min de inactividad |
| Usuarios y roles | Administrador, Regente, Cajero, Bodeguero y Auditor | Control por roles en el backend, mínimo privilegio, segregación de funciones |
| Inventario | Productos, lotes, vencimientos (FEFO), marca de medicamento controlado | Ajustes con motivo y **re-autenticación**; kardex de solo inserción |
| Ventas de mostrador | Cobro en efectivo o tarjeta **simulada**; comprobante a CF, NIT o DPI (obligatorio desde Q2,500.00) | Anulación solo por el Regente con re-autenticación y motivo; NIT y DPI cifrados; transacciones MongoDB |
| Clientes y fidelización | Registro con datos mínimos y puntos | **Consentimiento de privacidad obligatorio**; teléfono y correo cifrados |
| Recetas | Registro y despacho, incluidos medicamentos controlados | Visibles solo para el Regente; campos cifrados con **AES-256-GCM**; cada consulta queda en la bitácora |
| Bitácora de auditoría | Registro de quién hizo qué, cuándo y desde dónde | Colección de solo inserción **encadenada por hash SHA-256** y verificable |
| Reportes | Intentos fallidos, usuarios y roles, anulaciones, ajustes y despachos de controlados | Exportación a CSV solo para el Auditor, protegida contra inyección de fórmulas |

La re-autenticación (step-up) sirve para **una sola operación**, queda ligada a esa acción y a ese registro, y vence en 2 minutos. Se pide para anular ventas, ajustar inventario, despachar controlados, cambiar roles y otras operaciones administrativas.

## Tecnología

- **Cliente:** React 19 + TypeScript (Vite 8), React Router 7, `@simplewebauthn/browser`
- **API:** Node.js 22 + Express 5 + TypeScript, en capas `routes → controllers → services → models`
- **Base de datos:** MongoDB local (replica set) en desarrollo y MongoDB Atlas (M0) para la entrega, con Mongoose 9, transacciones y un usuario de base de datos con rol personalizado de mínimo privilegio
- **Seguridad:** helmet (CSP), CORS restringido, verificación de origen, Zod, `sanitizeFilter`, `express-rate-limit`, `express-session` + `connect-mongo`
- **Pruebas:** Vitest + Supertest + MongoDB en memoria (145 pruebas, incluidas las de seguridad)

## Estructura

```text
Farmacentro/
├── farmacentro-backend/     API (Express + TypeScript + MongoDB) y scripts de base de datos
├── Farmacentro-Frontend/    Cliente web (React + TypeScript + Vite)
└── docs/                    Diseño, matriz de controles y evidencias para el grupo auditor
```

Son dos proyectos **totalmente separados**: cada uno tiene su `package.json`, su `node_modules` y su `npm run dev`.

## Cómo ejecutarlo (local)

**Requisitos:** Node.js 22.12 o superior y MongoDB instalado en la PC y configurado como **replica set** (una sola vez; ver el [manual de instalación](docs/manual-instalacion.md)).

**Terminal 1 — backend**, en la carpeta `farmacentro-backend`:

```bash
npm install
npm run dev
```

La primera vez crea los índices y carga los datos de prueba automáticamente. En modo desarrollo, los códigos de verificación **aparecen en esta terminal**.

**Terminal 2 — frontend**, en la carpeta `Farmacentro-Frontend`:

```bash
npm install
npm run dev
```

Abre **http://localhost:5173** en Chrome o Edge. Las credenciales de prueba están en [docs/credenciales-prueba.md](docs/credenciales-prueba.md), no en este README.

`npm install` solo hace falta la primera vez o cuando cambian las dependencias. Si falta `farmacentro-backend/.env`, cópialo de `.env.example` y completa las claves con `npm run generate-keys`.

## Comandos útiles (en `farmacentro-backend`)

| Comando | Para qué |
|---|---|
| `npm test` | Pruebas de la API y de seguridad |
| `npm run lint` / `npm run typecheck` | Calidad del código (también existen en el frontend) |
| `npm run seed -- --reset` | Borra todo y vuelve a cargar los datos de prueba |
| `npm run init-replica-set` | Inicializa el replica set del MongoDB local |
| `npm run audit:check` | `npm audit` de ambos proyectos; falla si hay vulnerabilidades altas o críticas y guarda la evidencia |
| `npm run verify-audit` | Verifica la cadena de hash de la bitácora directamente en la base |
| `npm run check-db-privileges` | Evidencia de que el usuario de la API no puede modificar ni borrar la bitácora (Atlas) |
| `npm run backup` / `npm run restore-test` | Respaldo cifrado y prueba de restauración (simulado) |

## Documentación

| Documento | Contenido |
|---|---|
| [arquitectura.md](docs/arquitectura.md) | Componentes, flujos de login, huella y re-autenticación |
| [modelo-datos.md](docs/modelo-datos.md) | Colecciones, cifrado, bitácora y roles de MongoDB |
| [roles-permisos.md](docs/roles-permisos.md) | Matriz de rol por acción y catálogo de eventos |
| [api.md](docs/api.md) | Endpoints, validación y eventos de bitácora |
| [pantallas.md](docs/pantallas.md) | Pantallas por rol y navegación |
| [matriz-controles.md](docs/matriz-controles.md) | Controles ISO/IEC 27002 → estado → evidencia |
| [estructura-repositorio.md](docs/estructura-repositorio.md) | Carpetas, dependencias, variables de entorno y comandos |
| [limitaciones-conocidas.md](docs/limitaciones-conocidas.md) | Qué es simulado o solo documentado |
| [manual-instalacion.md](docs/manual-instalacion.md) | Instalación local, Atlas y despliegue |
| [credenciales-prueba.md](docs/credenciales-prueba.md) | Usuarios de prueba (solo desarrollo local) |
| [decisiones-pendientes.md](docs/decisiones-pendientes.md) | Supuestos, decisiones tomadas y preguntas abiertas |

## Fuera de alcance (solo documentado)

Tienda en línea, modo de contingencia del POS, red/VLAN/firewall, terminales P2PE y EDR.
