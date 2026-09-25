# 08-FarmaCentro — Sistema de gestión seguro y auditable

Prototipo académico del curso **Seguridad y Auditoría de Sistemas** (Universidad Mariano Gálvez de Guatemala, Sección A, Ing. Omar Eduardo Sagastume Álvarez).

**Equipo:** Edwar Daniel Calderón Cinco · José Eduardo Salguero Aquino · Henry David Cabrera Virula

> ⚠️ Sistema académico: usa **solo datos ficticios**. Los pagos son simulados y nunca se pide ni se guarda un dato de tarjeta.

## ¿Qué es?

FarmaCentro es una cadena ficticia de farmacias pyme en Guatemala. Esta aplicación web es su sistema de gestión de sucursal: ventas de mostrador, inventario con medicamentos controlados, clientes de fidelización, recetas y bitácora de auditoría.

Se diseñó a partir del modelo de seguridad basado en **ISO/IEC 27001:2022** (ver [docs/entregable2-modelo-seguridad.md](docs/entregable2-modelo-seguridad.md)), con dos objetivos: que sea **seguro** y que sea **fácil de auditar**. Cada control deja evidencia verificable: un registro en la bitácora, una configuración, una prueba automática o un documento. Otro grupo del curso lo auditará como auditor independiente.

## Funciones principales

| Módulo | Qué hace | Controles de seguridad destacados |
|---|---|---|
| Autenticación | Usuario y contraseña + **segundo factor**: huella (WebAuthn / Windows Hello) o código de 6 dígitos por correo | bcrypt (costo 12), bloqueo de 15 min tras 5 intentos, sesión en servidor que expira a los 15 min de inactividad |
| Usuarios y roles | Administrador, Regente, Cajero, Bodeguero y Auditor | Control por roles en el backend, mínimo privilegio, segregación de funciones |
| Inventario | Productos, lotes, vencimientos (FEFO), marca de medicamento controlado | Ajustes con motivo y **re-autenticación**; kardex de solo inserción |
| Ventas de mostrador | Cobro en efectivo o tarjeta **simulada** | Anulación solo por el Regente con re-autenticación y motivo; transacciones MongoDB |
| Clientes y fidelización | Registro con datos mínimos y puntos | **Consentimiento de privacidad obligatorio**; teléfono y correo cifrados |
| Recetas | Registro y despacho, incluidos medicamentos controlados | Visibles solo para el Regente; campos cifrados con **AES-256-GCM**; cada consulta queda en la bitácora |
| Bitácora de auditoría | Registro de quién hizo qué, cuándo y desde dónde | Colección de solo inserción **encadenada por hash SHA-256** y verificable |
| Reportes | Intentos fallidos, usuarios y roles, anulaciones, ajustes y despachos de controlados | Exportación a CSV solo para el Auditor, protegida contra inyección de fórmulas |

La re-autenticación (step-up) sirve para **una sola operación**, queda ligada a esa acción y a ese registro, y vence en 2 minutos. Se pide para anular ventas, ajustar inventario, despachar controlados, cambiar roles y otras operaciones administrativas.

## Tecnología

- **Cliente:** React 19 + TypeScript (Vite 8), React Router 7, `@simplewebauthn/browser`
- **API:** Node.js 22 + Express 5 + TypeScript, en capas `routes → controllers → services → models`
- **Base de datos:** MongoDB Atlas (M0) con Mongoose 9, transacciones y un usuario de base de datos con rol personalizado de mínimo privilegio
- **Seguridad:** helmet (CSP), CORS restringido, verificación de origen, Zod, `sanitizeFilter`, `express-rate-limit`, `express-session` + `connect-mongo`
- **Pruebas:** Vitest + Supertest + MongoDB en memoria (132 pruebas, incluidas las de seguridad)

## Despliegue

| Ambiente | Enlace | Estado |
|---|---|---|
| Producción (entrega al grupo auditor) | _pendiente: pegar aquí el enlace cuando se despliegue_ | ⏳ Sin desplegar |
| Repositorio | https://github.com/<usuario>/08-FarmaCentro | — |

Requisitos del despliegue: HTTPS y el **mismo dominio para el cliente y la API**. La cookie `SameSite=Strict` y WebAuthn lo exigen. Configura `SERVE_CLIENT=true`, `NODE_ENV=production`, `CLIENT_ORIGIN` y `RP_ID` con el dominio público. Detalles en [docs/manual-instalacion.md](docs/manual-instalacion.md).

## Inicio rápido (local)

```bash
npm install
npm run generate-keys
```

1. Copia `server/.env.example` a `server/.env` y `scripts/.env.example` a `scripts/.env`, y pega las claves generadas.
2. Base de datos: usa MongoDB Atlas (ver el manual) o, solo para desarrollo, `npm run dev:db`.
3. Correo de desarrollo: `docker compose up -d` (Mailpit en http://localhost:8025) o `npm run dev:mail`.
4. `npm run setup-db` y `npm run seed`.
5. En dos terminales: `npm run dev:server` y `npm run dev:client`. Abre http://localhost:5173 en Chrome o Edge.

Las credenciales de prueba están en [docs/credenciales-prueba.md](docs/credenciales-prueba.md), no en este README.

## Comandos útiles

| Comando | Para qué |
|---|---|
| `npm test` | Pruebas de la API y de seguridad |
| `npm run lint` / `npm run typecheck` | Calidad del código |
| `npm run audit:check` | `npm audit`; falla si hay vulnerabilidades altas o críticas y guarda la evidencia |
| `npm run verify-audit` | Verifica la cadena de hash de la bitácora directamente en la base |
| `npm run check-db-privileges` | Evidencia de que el usuario de la API no puede modificar ni borrar la bitácora |
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
| [limitaciones-conocidas.md](docs/limitaciones-conocidas.md) | Qué es simulado o solo documentado |
| [manual-instalacion.md](docs/manual-instalacion.md) | Instalación local, Atlas y despliegue |
| [decisiones-pendientes.md](docs/decisiones-pendientes.md) | Supuestos y preguntas abiertas |

## Fuera de alcance (solo documentado)

Tienda en línea, modo de contingencia del POS, red/VLAN/firewall, terminales P2PE y EDR.
