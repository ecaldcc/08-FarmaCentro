# Matriz de controles (versión inicial)

> Versión 0.2 (25/09/2026): actualizada tras implementar el código de los sprints 1 a 3 y las pruebas de seguridad (140 pruebas en verde). Versión 0.1 (24/09/2026): fase de diseño. Los controles son los de la **Tabla 12** del entregable 2 (`entregable2-modelo-seguridad.md`), con numeración de ISO/IEC 27002:2022.
> Las rutas de evidencia ya existen en el repositorio, salvo las capturas de Atlas y los documentos marcados como "propuesto", que quedan pendientes.

## Estados

| Estado | Significado para el grupo auditor |
|---|---|
| **Implementado** | Funciona en el prototipo y se puede probar. |
| **Simulado** | Existe en el prototipo, pero con un sustituto de la solución real (p. ej., pago sin procesador). |
| **Solo documentado** | Diseño o procedimiento descrito; no se implementa en el prototipo (fuera de alcance). |

Cuando un control tiene partes con distinto estado, se divide en filas.

## Matriz

| Control (ISO/IEC 27002:2022) | Aspecto | Estado previsto | Cómo se cumple en el prototipo | Evidencia (dónde quedará) | Sprint | Riesgos |
|---|---|---|---|---|---|---|
| **5.1** Políticas | Política de contraseñas en el sistema | Implementado | Mínimo 12 caracteres, máx. 72 bytes, sin el usuario, lista prohibida (D-20), bcrypt costo 12 | `farmacentro-backend/src/validation/common.ts`, `farmacentro-backend/src/services/password.service.ts`, `farmacentro-backend/tests/security/crypto-policy.test.ts` | 1 | Todos |
| 5.1 | Política general, uso aceptable y respaldo | Solo documentado | Documento de políticas | `docs/politicas-seguridad.md` (propuesto, D-25) | 4 | Todos |
| **5.15** Control de acceso | Control por roles en el backend | Implementado | `requireRole` en cada ruta; denegación por defecto; frontend solo oculta | `docs/roles-permisos.md`, `farmacentro-backend/src/middlewares/auth.ts`, `farmacentro-backend/src/routes/*.ts`, `farmacentro-backend/tests/security/rbac.test.ts`, eventos `authz.denied` | 1 | R03, R10 |
| **5.18** Derechos de acceso | Alta, baja y cambio de rol con 2FA y bitácora | Implementado | Endpoints 20–26 con re-autenticación; `loadUser` aplica cambios al instante | `farmacentro-backend/src/services/user.service.ts`, eventos `user.*`, reporte "Usuarios y roles" (CSV) | 2 | R03, R10 |
| 5.18 | Revisión trimestral de accesos | Solo documentado | Procedimiento que usa el reporte 56 como insumo | `docs/politicas-seguridad.md` (acta modelo) | 4 | R03 |
| **5.17** Información de autenticación | Almacenamiento y manejo de secretos de autenticación | Implementado | bcrypt costo 12; códigos guardados como HMAC; contraseña temporal mostrada una vez y con cambio obligatorio | `farmacentro-backend/src/services/password.service.ts`, `farmacentro-backend/src/services/otp.service.ts`, `farmacentro-backend/tests/security/lockout-otp.test.ts` | 1–2 | R02, R03 |
| **8.5** Autenticación segura | Segundo factor en el login | Implementado | WebAuthn con `userVerification: "required"`; código por correo de 6 dígitos (5 min, un uso, 5 intentos) | `farmacentro-backend/src/services/webauthn.service.ts`, `farmacentro-backend/src/services/otp.service.ts`, eventos `auth.mfa.*` | 2 | R02, R03 |
| 8.5 | Bloqueo por intentos | Implementado | 5 fallos → 15 min; mensaje genérico; `express-rate-limit` en login y envío de códigos | `farmacentro-backend/src/services/auth.service.ts`, `farmacentro-backend/src/middlewares/rateLimits.ts`, `farmacentro-backend/tests/security/lockout-otp.test.ts`, eventos `auth.account.locked` | 2 | R02 |
| 8.5 | Sesiones | Implementado | Sesión en servidor (`connect-mongo`), cookie `httpOnly`/`Secure`/`SameSite=Strict`, id regenerado al entrar, 15 min de inactividad | `farmacentro-backend/src/config/session.ts`, `farmacentro-backend/tests/security/session-stepup.test.ts` | 2 | R02, R03 |
| 8.5 | Re-autenticación en operaciones sensibles | Implementado | `requireStepUp(action)`: permiso de un uso, ligado a acción y registro, 2 min | `farmacentro-backend/src/middlewares/stepUp.ts`, `farmacentro-backend/tests/security/session-stepup.test.ts`, eventos `auth.stepup.*` | 2–3 | R03, R10 |
| 8.5 | Huella con detección de ataques de presentación (ISO/IEC 30107-3) | Solo documentado | Depende del lector físico; el servidor no puede comprobarlo (C-02) | `docs/limitaciones-conocidas.md` | 4 | R03 |
| 8.5 | Código por SMS | Solo documentado | El entregable lo menciona; el prototipo solo usa correo | `docs/limitaciones-conocidas.md` | 4 | R02 |
| **5.19–5.22** Proveedores | Atlas, proveedor de correo | Solo documentado | Cláusulas de seguridad y evidencias de cumplimiento del proveedor | `docs/proveedores.md` (propuesto) con enlaces a las certificaciones públicas de Atlas | 4 | R14 |
| 5.19–5.22 | Dependencias de software (cadena de suministro) | Implementado | `package-lock.json` versionado, `npm audit` sin altas ni críticas, dependencias mínimas | `package-lock.json`, `docs/evidencias/npm-audit-2026-09-25.txt (0 vulnerabilidades)` | 1–4 | R14 |
| **5.24–5.28** Incidentes | Procedimiento de gestión (ISO/IEC 27035-1) | Solo documentado | Fases, roles y formato de registro de incidentes | `docs/procedimiento-incidentes.md` (propuesto) | 4 | R01, R02 |
| 5.28 | Recolección de evidencia | Implementado | Bitácora encadenada por hash, exportable y verificable; `requestId` que liga bitácora y log técnico | `GET /api/audit/verify`, `farmacentro-backend/scripts/verify-audit-chain.ts` | 1, 4 | R03, R10 |
| **5.29, 5.30** Continuidad TIC | Modo de contingencia del POS y enlace de respaldo | Solo documentado | Fuera de alcance del prototipo | `docs/limitaciones-conocidas.md` | 4 | R09, R12 |
| **5.34** Privacidad y datos personales | Consentimiento obligatorio y minimización | Implementado | Aviso versionado; la API rechaza el registro sin `consent.accepted = true`; solo nombre y contacto | `farmacentro-backend/src/validation/customer.schemas.ts`, `farmacentro-backend/tests/modules/customers-prescriptions.test.ts`, eventos `customer.created` (con `noticeVersion`) | 3 | R05 |
| 5.34 | Rectificación y retiro del consentimiento | Implementado | Corrección de datos y anonimización | Endpoints 45 y 46, evento `customer.consent.withdrawn` | 3 | R05 |
| 5.34 | Recetas separadas y cifradas; acceso solo del Regente | Implementado | Colección `prescriptions` con campos cifrados; cada lectura registrada | `docs/modelo-datos.md` §4.11, eventos `prescription.viewed`, `farmacentro-backend/tests/modules/customers-prescriptions.test.ts` | 3 | R05 |
| **6.3** Concienciación y capacitación | Inducción y simulaciones de phishing | Solo documentado | Plan de capacitación | `docs/politicas-seguridad.md` | 4 | R02, R13 |
| **7.1–7.4** Seguridad física | Control de acceso y cámaras en bodega | Solo documentado | Fuera de alcance | `docs/limitaciones-conocidas.md` | 4 | R10, R11 |
| **8.1** Dispositivos de usuario final | Cierre de sesión por inactividad | Implementado | 15 min de inactividad en servidor + aviso en el cliente | `farmacentro-backend/src/config/session.ts`, `farmacentro-backend/tests/security/session-stepup.test.ts` | 2 | R11 |
| 8.1 | Cifrado de disco (BitLocker) y USB restringido | Solo documentado | Configuración de equipos, fuera de alcance | `docs/limitaciones-conocidas.md` | 4 | R11 |
| **8.7** Protección contra malware | EDR administrado | Solo documentado | Fuera de alcance | `docs/limitaciones-conocidas.md` | 4 | R01 |
| **8.8** Gestión de vulnerabilidades técnicas | Dependencias de la aplicación | Implementado | `npm audit` en cada sprint, sin altas ni críticas; versiones fijadas | `docs/evidencias/npm-audit-2026-09-25.txt (0 vulnerabilidades)`, script `npm run audit:check` | 1–4 | R01, R06, R14 |
| 8.8 | Parches de equipos (≤ 30 días) | Solo documentado | Fuera de alcance | `docs/limitaciones-conocidas.md` | 4 | R01 |
| **8.9** Gestión de la configuración | Configuración segura de la aplicación | Implementado | `helmet` + CSP, CORS, `sanitizeFilter`, `strictQuery`, cookie segura, `.env.example` sin valores | `farmacentro-backend/src/app.ts`, `farmacentro-backend/src/config/*.ts`, `farmacentro-backend/.env.example`, `farmacentro-backend/tests/security/web-security.test.ts` | 1 | R06, R13 |
| 8.9 | Configuración base CIS de equipos | Solo documentado | Fuera de alcance | `docs/limitaciones-conocidas.md` | 4 | R01, R07 |
| **8.13** Respaldo de la información | Respaldo y prueba de restauración | Simulado (D-18) | Atlas M0 no incluye respaldos automáticos: script de exportación cifrada y restauración en una base local | `farmacentro-backend/scripts/backup.ts`, `farmacentro-backend/scripts/restore-test.ts`, `docs/evidencias/prueba-restauracion-<fecha>.md` | 4 | R08 |
| **8.14** Redundancia | Base de datos replicada | Implementado (por el proveedor) | Atlas M0 es un conjunto de réplicas de 3 nodos | Captura de la configuración del clúster en `docs/evidencias/` | 1 | R08 |
| 8.14 | Enlace de Internet de respaldo | Solo documentado | Fuera de alcance | `docs/limitaciones-conocidas.md` | 4 | R09 |
| **8.15** Registro (logging) | Bitácora de auditoría | Implementado | `audit_logs` de solo inserción, encadenada por SHA-256, con todos los campos exigidos | `farmacentro-backend/src/services/audit.service.ts`, `docs/modelo-datos.md` §4.14, `farmacentro-backend/tests/security/audit-tamper.test.ts` | 1 | R03, R10 |
| 8.15 | Protección de la bitácora en la base de datos | Implementado | Usuario de la API con solo `insert` y `find` sobre `audit_logs` | Captura del rol en Atlas, salida de `farmacentro-backend/scripts/check-db-privileges.ts` | 1 | R03, R10 |
| 8.15 | Conservación de 12 meses | Solo documentado | La API no puede borrar; no hay purga en el prototipo | `docs/limitaciones-conocidas.md` | 4 | R03 |
| **8.16** Actividades de monitoreo | Reportes de auditoría | Implementado | Intentos fallidos, usuarios y roles, anulaciones, ajustes, despachos; CSV | `farmacentro-backend/src/services/report.service.ts`, pantallas U1–U3 | 4 | R02, R10 |
| 8.16 | Alertas automáticas | Implementado (parcial) | Correo al usuario ante bloqueo, intentos de código agotados, nueva huella, cambio de contraseña o de correo (D-22) | `farmacentro-backend/src/services/mail.service.ts`, eventos relacionados | 2 | R02 |
| **8.20, 8.22** Seguridad y segregación de redes | VLAN y firewall por sucursal | Solo documentado | Fuera de alcance (Figura 1 del entregable) | `docs/limitaciones-conocidas.md` | 4 | R07 |
| 8.20 | Acceso de red a la base de datos | Implementado | Lista de acceso por IP en Atlas, TLS obligatorio | Captura de Network Access en `docs/evidencias/` | 1 | R07 |
| **8.24** Uso de criptografía | Cifrado de campos sensibles | Implementado | AES-256-GCM, IV aleatorio por registro, AAD por campo, claves en `.env` con versión | `farmacentro-backend/src/services/crypto.service.ts`, `farmacentro-backend/tests/security/crypto-policy.test.ts`, documento de la BD donde se ve el cifrado | 3 | R05 |
| 8.24 | Cifrado en tránsito | Implementado / pendiente | TLS con Atlas: implementado. HTTPS del navegador a la API: depende del despliegue (D-01) | `farmacentro-backend/src/config/db.ts`, configuración del despliegue | 1, 4 | R04, R05 |
| 8.24 | Cifrado en reposo del proveedor | Implementado (por el proveedor) | Atlas cifra el almacenamiento | Documentación pública de Atlas | 1 | R05 |
| 8.24 | Terminales P2PE | Solo documentado | Pago simulado; nunca se almacena ni se pide un dato de tarjeta | `docs/limitaciones-conocidas.md`, esquema `sales.payment` | 3 | R04 |
| **8.25** Ciclo de vida de desarrollo seguro | Requisitos de seguridad desde el diseño | Implementado | Estos documentos de diseño; criterios de seguridad en cada historia | `docs/arquitectura.md`, `docs/api.md`, `docs/roles-permisos.md` | 1 | R06, R13 |
| **8.26** Requisitos de seguridad de aplicaciones | Validación, errores genéricos, pagos simulados | Implementado | Zod en todas las entradas; respuestas sin stack traces | `farmacentro-backend/src/validation/`, `farmacentro-backend/src/middlewares/errorHandler.ts`, `farmacentro-backend/tests/security/web-security.test.ts` | 1 | R06 |
| **8.27** Arquitectura segura | Capas y defensa en profundidad | Implementado | `routes → controllers → services → models`, mínimo privilegio en BD, mismo origen | `docs/arquitectura.md`, `docs/estructura-repositorio.md` | 1 | R06 |
| **8.28** Codificación segura | Inyección NoSQL, XSS, CSRF | Implementado | `sanitizeFilter`, `strictQuery`, `strictObject`, sin `req.body` directo a consultas, sin `dangerouslySetInnerHTML`, CSP, verificación de origen, ESLint de seguridad | `farmacentro-backend/tests/security/nosql-injection.test.ts`, `farmacentro-backend/tests/security/web-security.test.ts`, `farmacentro-backend/eslint.config.js`, `Farmacentro-Frontend/eslint.config.js` | 1–4 | R06 |
| **8.29** Pruebas de seguridad | Pruebas automatizadas | Implementado | Vitest + Supertest: inyección NoSQL, rol no autorizado, bloqueo, expiración de sesión, alteración de bitácora, re-autenticación | `farmacentro-backend/tests/security/`, `docs/evidencias/resultado-pruebas-<fecha>.txt` | 4 | R06 |
| 8.29 | Prueba de penetración por el grupo auditor | Implementado (por terceros) | Reglas en `reglas-auditoria.md` | `docs/reglas-auditoria.md`, informe del grupo auditor | 4 | R06 |
| **8.32** Gestión de cambios | Cambios aprobados en Git | Implementado | Ramas por módulo, commits pequeños, revisión antes de fusionar | Historial de Git, `docs/evidencias/` | 1–4 | R13 |

## Fuera de alcance (resumen)

Tienda en línea, modo de contingencia del POS, red/VLAN/firewall, terminales P2PE y EDR: **solo documentado**, como indica CLAUDE.md. Se detallan en `limitaciones-conocidas.md` (sprint 4).

## Controles adicionales sugeridos (no están en la Tabla 12)

El diseño ya cubre estos controles; se sugiere agregarlos a la declaración de aplicabilidad para que el grupo auditor los pueda evaluar (decisión D-25):

| Control | Por qué aplica |
|---|---|
| 5.3 Segregación de funciones | El Cajero no anula, el Bodeguero no marca controlados, el Administrador no opera (roles-permisos.md §1). |
| 5.33 Protección de registros | Bitácora e historial de inventario de solo inserción. |
| 8.2 Derechos de acceso privilegiado | Administrador sin acceso a operación, recetas ni bitácora; nadie cambia su propio rol. |
| 8.3 Restricción de acceso a la información | Recetas solo para el Regente; el cajero solo ve sus ventas del día. |
| 8.4 Acceso al código fuente | Repositorio privado, `.env` fuera de Git. |
| 8.11 Enmascaramiento de datos | Teléfono y correo enmascarados; reporte de controlados seudonimizado. |
| 8.12 Prevención de fuga de datos | Exportación CSV solo para el Auditor, sin datos de salud, registrada. |
| 8.31 Separación de ambientes | `.env` distinto para desarrollo/pruebas (`mongodb-memory-server`) y la base de Atlas. |
