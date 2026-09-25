# Decisiones pendientes y supuestos del diseño

> Versión inicial (24/09/2026). Acompaña a `arquitectura.md`, `modelo-datos.md`, `roles-permisos.md`, `api.md`, `pantallas.md`, `matriz-controles.md` y `estructura-repositorio.md`.
> Cada decisión indica el **supuesto que tomé** para poder avanzar con el diseño y la **pregunta** que necesito que respondan. Si responden distinto, se ajustan los documentos antes de escribir código.

## 1. Conflictos detectados (no los resolví por mi cuenta)

### C-01. `SameSite=Strict`, cookie `Secure` y WebAuthn obligan a un despliegue en el mismo sitio y con HTTPS
- CLAUDE.md pide cookie `Secure` + `SameSite=Strict` y WebAuthn (que solo funciona en `localhost` o HTTPS).
- Consecuencias: (1) el cliente y la API **no** pueden estar en dominios distintos (por ejemplo, cliente en un hosting estático y API en otro): la cookie no viajaría; (2) fuera de `localhost` hace falta HTTPS; (3) en `http://localhost` Chrome y Edge aceptan cookies `Secure`, pero **Safari no**.
- Diseño actual: en desarrollo, Vite hace de proxy (un solo origen); para la entrega, Express sirve el cliente compilado y la API en el mismo origen. **Ver D-01.**

### C-02. `userVerification: "required"` no garantiza que se usó la **huella**
- El entregable y CLAUDE.md hablan de "huella". WebAuthn solo informa que el dispositivo verificó al usuario (bandera UV), sin decir con qué método. Windows Hello acepta **huella o PIN** y el servidor no los puede distinguir.
- Tampoco se puede comprobar desde el servidor la detección de ataques de presentación (ISO/IEC 30107-3); depende del lector.
- Opciones: (a) documentarlo como limitación y redactar el requisito como "verificación del usuario en el dispositivo (huella o PIN de Windows Hello)"; (b) además, documentar como control "solo documentado" una directiva de Windows que deshabilite el PIN en las cajas.
- **Pregunta**: ¿aceptan (a) + (b)? ¿Hay que corregir la redacción del entregable?

### C-03. El entregable exige **huella** en operaciones sensibles; CLAUDE.md dice "segundo factor" y permite el correo como alternativa
- Entregable, §2.7: "las operaciones sensibles exigen la huella mediante WebAuthn". CLAUDE.md: "Pedir de nuevo el segundo factor para: anular ventas, ajustar inventario, despachar controlados y cambiar roles", con el código por correo como alternativa general.
- Diseño actual: lo dejé configurable con `STEP_UP_ALLOW_EMAIL`. **Ver D-03.**

### C-04. SMS
- El entregable menciona "código temporal por SMS o correo"; CLAUDE.md solo correo. Supuesto: SMS **no** se implementa y aparece como "solo documentado" en la matriz. **¿Correcto?**

### C-05. Conservación de la bitácora por 12 meses vs. bitácora inmodificable
- El entregable (control 8.15) pide conservar 12 meses (lo que implica purgar lo más antiguo). CLAUDE.md pide una colección de solo inserción y el usuario de la API no puede borrar. Además, purgar el inicio de la cadena rompería la verificación salvo que se guarde un "punto de partida" firmado.
- Supuesto: en el prototipo no se purga nada y la retención queda "solo documentada". **¿De acuerdo?**

### C-06. Detalles del entregable que el diseño no refleja literalmente
- Tabla 2 lista "plantillas biométricas" como activo: con WebAuthn **no** se guardan plantillas en el servidor (solo la clave pública); la huella nunca sale del dispositivo.
- Tabla 12 (8.15) habla de registrar "equipo": el diseño registra IP y user agent, no una identidad de equipo.
- **Pregunta**: ¿se corrige el entregable o se aclara en `limitaciones-conocidas.md`?

## 2. Decisiones pendientes

| Id | Tema | Supuesto que tomé | Pregunta |
|---|---|---|---|
| **D-01** | Despliegue para el grupo auditor | Instalan el sistema **en su máquina** (`localhost`), con Express sirviendo cliente y API en el mismo origen. No hay servidor público. | ¿El grupo auditor lo usará local o necesitan una URL pública con HTTPS? Si es pública: ¿qué hosting? (debe servir cliente y API en el mismo dominio). |
| **D-02** | Navegador soportado | Chrome o Edge en Windows 11 con Windows Hello. | ¿Confirmamos? ¿Los auditores tienen lector de huella o Windows Hello? Si no, solo podrán usar el código por correo. |
| **D-03** | Correo para re-autenticación | `STEP_UP_ALLOW_EMAIL=true` en desarrollo (para quien no tenga lector) y recomendación de `false` en la demostración: las operaciones sensibles solo con huella, como dice el entregable. | ¿Qué valor usamos en la entrega? Si es `false`, un usuario sin huella registrada no podrá anular, ajustar, despachar controlados ni cambiar roles. |
| **D-04** | Versión de Node y TypeScript | **Node 24 LTS** (el Node 20.19.4 instalado terminó su soporte en abril de 2026 y Vitest 5 y React Router 8 exigen 22+). **TypeScript 6.0.3**, no 7.0.2, porque `typescript-eslint` aún no soporta la 7. | ¿Todos los integrantes pueden instalar Node 24? |
| **D-05** | Librería de bcrypt | `bcrypt` 6.0.0 (nativa, más rápida). Si la compilación falla en alguna máquina Windows, usar `bcryptjs` 3.0.3 (JavaScript puro, mismo formato de hash). | ¿Alguna preferencia? |
| **D-06** | Servidor de correo | **Mailpit** local (SMTP de pruebas con bandeja web en `localhost:8025`): no manda correos reales y el auditor puede ver los códigos. | ¿Mailpit (requiere Docker o el ejecutable), Ethereal, o una cuenta real (Gmail con contraseña de aplicación)? |
| **D-07** | Quién anula ventas y en qué plazo | Solo el **Regente**, con re-autenticación y motivo, y solo ventas **del mismo día**. El Cajero no anula. | ¿Solo el Regente? ¿El Cajero puede anular sus propias ventas con 2FA? ¿Qué plazo? |
| **D-08** | Venta de controlados | Los controlados **no** se venden en el POS normal; solo el Regente los despacha desde una receta (despacho = venta + registro de dispensación). | ¿Correcto? ¿Hace falta además una marca "requiere receta" para medicamentos no controlados (p. ej. antibióticos)? |
| **D-09** | Instancias de la API | Una sola instancia. La cadena de la bitácora se serializa con un candado en memoria y `express-rate-limit` usa memoria. Con varias instancias habría que mover ambos a MongoDB. | ¿Confirmamos una sola instancia? |
| **D-10** | Ancla de la bitácora | Al final de la entrega se anota el último `seq` y `hash` (pantalla U2) y se entrega al grupo auditor fuera del sistema (correo o acta), para detectar borrado de los últimos registros o reescritura completa. | ¿Lo incluimos en `reglas-auditoria.md`? |
| **D-11** | Acceso directo del auditor a la BD | Crear `farmacentro_audit_reader` (solo `find` sobre `audit_logs`) para que verifiquen la cadena con su propio script. | ¿Les damos esa credencial? |
| **D-12** | Cifrado de datos del cliente | Cifrar **teléfono y correo** (con índice ciego para buscar) y dejar el **nombre en claro** (hace falta verlo en listas). | ¿Ciframos también el nombre? Implica que no se podrá buscar por nombre. |
| **D-13** | Alcance del Administrador | El Administrador **no** vende, no toca inventario, no ve recetas y **no** lee la bitácora (solo el reporte de usuarios y roles). | ¿El Administrador debe poder leer la bitácora (p. ej., para responder a incidentes)? |
| **D-14** | Puntos de fidelización | Acumular **1 punto por cada Q10** del total; sin canje en el prototipo. La anulación revierte los puntos. | ¿Regla de acumulación? ¿Se implementa el canje? |
| **D-15** | Sucursales | Una sola sucursal: no hay colección `branches` ni filtros por sucursal. | ¿Necesitan modelar las 3 sucursales del piloto? |
| **D-16** | Vigencia de recetas y despacho parcial | Receta vigente 30 días desde `issuedAt`; se permite despacho parcial hasta completar lo prescrito. | ¿Plazo de vigencia? ¿Los controlados deben despacharse completos y en una sola vez? |
| **D-17** | Reporte de despachos de controlados | Visible para el Regente y el Auditor, **seudonimizado** (folio, producto, lote, cantidad, regente; sin paciente ni médico). | ¿El Auditor puede ver este reporte? Ayuda a auditar el riesgo R10 (fraude con controlados). |
| **D-18** | Respaldo (8.13) | Atlas M0 no ofrece respaldos automáticos (confirmar en la consola del proyecto). Propuesta: **simulado** con `scripts/backup.ts` (exportación cifrada a archivo local) y `scripts/restore-test.ts` (restaura en una base local y compara conteos y la cadena de bitácora). | ¿Lo implementamos así o queda "solo documentado"? |
| **D-19** | Recuperación de contraseña | No hay autoservicio ("olvidé mi contraseña"): la restablece el Administrador con 2FA y el usuario la cambia al entrar. | ¿De acuerdo? |
| **D-20** | Lista de contraseñas prohibidas | Incluir una lista de contraseñas comunes (≈10 000) en `server/src/data/common-passwords.txt`, como recomienda NIST SP 800-63B-4. | ¿La incluimos? |
| **D-21** | Duración máxima de la sesión | Además de los 15 min de inactividad, un máximo **absoluto de 8 horas** (un turno). | ¿Lo agregamos? CLAUDE.md solo pide el de inactividad. |
| **D-22** | Notificaciones por correo | Avisar al usuario cuando: se bloquea su cuenta, se agotan los intentos de un código, se registra o revoca una huella, cambia su contraseña, rol o correo. | ¿Es lo que se quiere decir con "notificación al usuario"? ¿También avisar al Administrador cuando se bloquea una cuenta? |
| **D-23** | Esquemas compartidos cliente/servidor | No hay carpeta `shared`: el cliente hace validaciones básicas de formulario y el servidor es la autoridad. | ¿Prefieren una carpeta `/shared` con los esquemas Zod? (agrega una carpeta a la estructura de CLAUDE.md) |
| **D-24** | Fallos del 2.º factor y bloqueo | Los fallos de huella o código (en login y re-autenticación) **cuentan** para el bloqueo de 5 intentos, igual que la contraseña. | ¿De acuerdo? |
| **D-25** | Documentos y controles adicionales | Agregar `politicas-seguridad.md`, `procedimiento-incidentes.md` y `proveedores.md` (solo documentado) y los controles 5.3, 5.33, 8.2, 8.3, 8.4, 8.11, 8.12 y 8.31 a la matriz. | ¿Los agregamos? No están en la lista del paquete de CLAUDE.md ni en la Tabla 12. |
| **D-26** | Registrar las ventas normales en la bitácora | Sí se registran (`sale.created`); CLAUDE.md no lo exige, pero ayuda a auditar. Volumen bajo para un prototipo (Atlas M0: 512 MB, 100 operaciones/s). | ¿Las registramos? |

## 3. Otros supuestos que tomé

1. Moneda: quetzales, guardados como **centavos enteros**; los precios incluyen IVA. La factura electrónica (FEL de la SAT) queda fuera de alcance.
2. Fechas guardadas en UTC y mostradas en hora de Guatemala (`America/Guatemala`).
3. Nadie se registra solo: el Administrador crea todas las cuentas; `scripts/seed.ts` crea el primer Administrador.
4. Tiempos: 5 min para completar el segundo factor del login; 2 min de vigencia del desafío WebAuthn y del permiso de re-autenticación; 5 min del código por correo; máximo 5 huellas por usuario.
5. Los mensajes de login no distinguen entre usuario inexistente, contraseña incorrecta, cuenta bloqueada o deshabilitada; el motivo real solo queda en la bitácora.
6. Una respuesta 403 por falta de re-autenticación no se registra (es parte del flujo); sí se registran los intentos fallidos de re-autenticación y los 403 por rol.
7. En el sprint 1 el login funcionará solo con contraseña (el segundo factor llega en el sprint 2); eso solo en desarrollo, nunca en una entrega.
8. Las pruebas automáticas usan `mongodb-memory-server` como conjunto de réplicas y un autenticador WebAuthn por software **solo en pruebas**; nunca tocan Atlas.
9. Los correos nunca incluyen datos de salud ni de clientes; solo el código o el aviso.
10. Los productos nuevos siempre nacen "no controlados"; solo el Regente cambia esa marca, con 2FA.
