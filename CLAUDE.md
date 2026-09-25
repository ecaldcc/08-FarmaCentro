# FarmaCentro — Sistema de gestión (prototipo académico)

## Contexto
- Proyecto del curso Seguridad y Auditoría de Sistemas (UMG, Sección A, Ing. Omar Eduardo Sagastume Álvarez).
- Empresa ficticia: FarmaCentro, cadena de farmacias pyme en Guatemala (ventas en mostrador, fidelización, recetas, inventario con medicamentos controlados).
- Equipo: Edwar Daniel Calderón Cinco, José Eduardo Salguero Aquino, Henry David Cabrera Virula.
- El sistema es académico: se usan **solo datos ficticios** y lo auditará **otro grupo del curso** como auditor independiente.
- Objetivo de diseño: que el sistema sea seguro **y fácil de auditar**. Cada control debe dejar una evidencia verificable (registro en bitácora, configuración, prueba o documento).
- Documento de referencia: `docs/entregable2-modelo-seguridad.md`, el modelo de seguridad basado en ISO/IEC 27001:2022. Los números de control que se citan aquí (por ejemplo, 8.5) son de ISO/IEC 27002:2022. Consúltalo cuando necesites justificar una decisión o llenar la matriz de controles.

## Stack
- Frontend: React + TypeScript (Vite).
- Backend: Node.js + Express + TypeScript, en capas `routes → controllers → services → models`.
- Base de datos: MongoDB Atlas (plan gratuito) con Mongoose.
- Estructura del repositorio: `/client`, `/server`, `/docs`, `/scripts`.
- Idioma: interfaz y documentación en español; código, nombres de variables y commits en inglés.

## Módulos
1. **Autenticación**: usuario y contraseña, segundo factor, bloqueo por intentos y cierre de sesión por inactividad.
2. **Usuarios y roles**: Administrador, Regente (farmacéutico regente), Cajero, Bodeguero y Auditor. El Auditor solo lee la bitácora y los reportes.
3. **Inventario**: productos, lotes, vencimientos y marca de medicamento controlado. Los ajustes piden segundo factor y motivo.
4. **Ventas de mostrador**: pago simulado. Anular una venta pide segundo factor y motivo.
5. **Clientes y fidelización**: datos mínimos, consentimiento de privacidad obligatorio y puntos.
6. **Recetas**: solo visibles para el Regente; campos sensibles cifrados.
7. **Bitácora de auditoría**: inmodificable, con encadenamiento por hash.
8. **Reportes de auditoría**: bitácora filtrable, intentos fallidos, usuarios y roles, anulaciones y ajustes; exportación a CSV.

## Requisitos de seguridad (obligatorios)
### Autenticación y sesiones (controles 5.17, 8.5)
- Contraseñas con `bcrypt` (costo ≥ 12) y mínimo 12 caracteres.
- Bloqueo de 15 minutos tras 5 intentos fallidos.
- Sesión en el servidor (`express-session` + `connect-mongo`) con cookie `httpOnly`, `Secure` y `SameSite=Strict`. Regenerar el id de sesión al iniciar sesión y expirar la sesión tras 15 minutos de inactividad.
- Nunca guardar tokens ni datos de sesión en `localStorage`.
### Segundo factor
- Primera opción: huella con WebAuthn (`@simplewebauthn/server` y `@simplewebauthn/browser`) con `userVerification: "required"`. WebAuthn solo funciona en `localhost` o con HTTPS.
- Alternativa: código de 6 dígitos por correo (Nodemailer). Es de un solo uso, vence en 5 minutos y se invalida al generar uno nuevo. Guardar solo el hash del código, con límite de intentos y notificación al usuario.
- Pedir de nuevo el segundo factor para: anular ventas, ajustar inventario, despachar controlados y cambiar roles.
### Autorización (5.15, 5.18)
- Control por roles aplicado en el backend con middleware. El frontend solo oculta opciones; nunca es la única barrera.
- Mínimo privilegio en todo.
### Entradas e inyección (8.28)
- Validar todo lo que entra a la API con Zod.
- `mongoose.set('sanitizeFilter', true)` y `strictQuery`.
- Nunca pasar `req.body` o `req.query` directo a una consulta.
### Seguridad web
- `helmet` con Content Security Policy.
- CORS restringido al origen del cliente.
- Verificación de origen en solicitudes que cambian datos.
- `express-rate-limit` en el login y en el envío de códigos.
- No usar `dangerouslySetInnerHTML`.
- Mensajes de error genéricos, sin stack traces en las respuestas.
### Datos y cifrado (8.24, 5.34)
- Recetas y campos sensibles cifrados con AES-256-GCM (módulo `crypto`), con IV aleatorio por registro.
- Secretos en `.env` (excluido en `.gitignore`); incluir un `.env.example` sin valores reales.
- Pagos simulados: **nunca** almacenar datos de tarjeta, solo una referencia de autorización ficticia.
- Consentimiento de privacidad obligatorio al registrar un cliente de fidelización.
### Bitácora (8.15, 8.16)
- Colección `audit_logs` de solo inserción. Cada registro guarda: usuario, rol, acción, entidad, id de la entidad, resultado, fecha en UTC, IP, user agent y el hash del registro anterior.
- El usuario de base de datos de la API usa un rol personalizado con solo `insert` y `find` sobre `audit_logs`.
- Registrar: inicios de sesión exitosos y fallidos, eventos de segundo factor, cambios de rol, anulaciones, ajustes, accesos a recetas y exportaciones.
### Integridad
- Ventas y ajustes de inventario usan transacciones de MongoDB.
### Dependencias (OWASP Top 10:2025)
- `npm audit` sin vulnerabilidades altas ni críticas.
- `package-lock.json` versionado.

## Fuera de alcance (solo documentado, no se implementa)
Tienda en línea, modo de contingencia del POS, red/VLAN/firewall, terminales P2PE y EDR. Márcalos como "solo documentado" en la matriz de controles.

## Datos de prueba
- `scripts/seed.ts` con datos ficticios y un usuario por rol.
- Las credenciales de prueba van en `docs/credenciales-prueba.md`, no en el README.

## Pruebas
- Pruebas de la API con Vitest + Supertest.
- Incluir casos de seguridad: inyección NoSQL, acceso por rol no autorizado, bloqueo por intentos, expiración de sesión y alteración de la bitácora.

## Plan (4 sprints de 2 semanas)
1. Estructura del repositorio, modelos, login con bcrypt, roles y bitácora.
2. Segundo factor (WebAuthn y correo), bloqueo, sesiones y administración de usuarios.
3. Inventario, ventas con anulación protegida, clientes con consentimiento y recetas cifradas.
4. Reportes de auditoría, pruebas de seguridad, `npm audit` y paquete para el grupo auditor.

## Paquete para el grupo auditor (`/docs`)
- `matriz-controles.md`: control ISO/IEC 27002 → estado (implementado / simulado / solo documentado) → dónde está la evidencia.
- Manual de instalación, diagrama de arquitectura y diccionario de datos.
- `limitaciones-conocidas.md` (pago simulado, controles fuera de alcance).
- `reglas-auditoria.md`: alcance, pruebas permitidas, fuera de alcance, plazo y formato de hallazgos con severidad.

## Forma de trabajar
- Commits pequeños y ramas por módulo.
- Antes de dar algo por terminado, verificar que cumpla los requisitos de seguridad de este archivo y que deje su evidencia.
