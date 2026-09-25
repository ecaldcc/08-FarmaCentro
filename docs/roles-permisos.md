# Roles y permisos

> Documento de diseño (versión inicial, 24/09/2026). Controles: 5.15 (control de acceso), 5.18 (derechos de acceso), 5.3 (segregación de funciones, como apoyo), 8.2 (derechos de acceso privilegiado), 8.15 (registro).

## 1. Principios

1. **La autorización se decide en el backend**, con `requireRole(...)` y, cuando aplica, `requireStepUp(action)` en cada ruta. El frontend solo oculta opciones; nunca es la única barrera.
2. **Mínimo privilegio**: cada rol recibe solo lo necesario para su trabajo. Lo no listado está prohibido (denegación por defecto).
3. **Segregación de funciones** (riesgo R10, fraude con inventario y controlados):
   - El Administrador gestiona cuentas, pero **no** vende, no ajusta inventario, no ve recetas y no lee la bitácora (propuesta, ver D-13).
   - Quien registra una venta (Cajero) no la anula; la anula el Regente con re-autenticación (ver D-07).
   - Solo el Regente cambia la marca de "controlado" de un producto, ajusta existencias de controlados y despacha controlados.
   - El Auditor solo lee: bitácora, reportes y exportaciones.
   - Nadie puede cambiar su propio rol ni deshabilitarse a sí mismo; no se puede dejar el sistema sin Administradores activos.
4. **Re-autenticación (step-up)**: permiso de un solo uso, ligado a la acción y al registro, válido 2 minutos (ver `arquitectura.md` §8.3).

## 2. Descripción de roles

| Rol | Código | Pantalla de inicio | Propósito |
|---|---|---|---|
| Administrador | `admin` | Usuarios | Alta, baja, roles, desbloqueos, restablecer contraseñas y revocar huellas perdidas. |
| Regente (farmacéutico regente) | `regente` | Punto de venta | Supervisor de sucursal: vende, anula, despacha recetas y controlados, ajusta controlados. |
| Cajero | `cajero` | Punto de venta | Ventas de productos **no controlados** y registro de clientes de fidelización. |
| Bodeguero | `bodeguero` | Inventario | Catálogo, entradas de mercadería, lotes, vencimientos y ajustes de no controlados. |
| Auditor | `auditor` | Bitácora | Solo lectura de bitácora y reportes, exportación CSV y verificación de la cadena. |

## 3. Matriz de rol por acción

Leyenda: ✅ permitido · 🔸 permitido con restricción (ver nota) · — denegado (403 y evento `authz.denied`).
**2FA** = exige re-autenticación (huella o, si se aprueba D-03, código por correo) inmediatamente antes de la operación.
**Bitácora** = evento que se registra (catálogo en §4). "—" = no se registra (lecturas no sensibles).

### 3.1 Cuenta propia (todos los roles)

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Iniciar sesión (contraseña + 2.º factor) | ✅ | ✅ | ✅ | ✅ | ✅ | Login | `auth.password.success` / `auth.login.failure` / `auth.login.success` / `auth.account.locked` / `auth.mfa.*` |
| Cerrar sesión | ✅ | ✅ | ✅ | ✅ | ✅ | No | `auth.logout` |
| Ver mi perfil y expiración de sesión | ✅ | ✅ | ✅ | ✅ | ✅ | No | — |
| Cambiar mi contraseña | ✅ | ✅ | ✅ | ✅ | ✅ | No (pide la actual) | `auth.password.changed` |
| Registrar una huella en mi cuenta | ✅ | ✅ | ✅ | ✅ | ✅ | **Sí** | `webauthn.credential.registered` |
| Revocar una de mis huellas | ✅ | ✅ | ✅ | ✅ | ✅ | **Sí** | `webauthn.credential.revoked` |

### 3.2 Usuarios y roles

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Listar / ver usuarios | ✅ | — | — | — | 🔸¹ | No | — |
| Crear usuario (asigna rol) | ✅ | — | — | — | — | **Sí** | `user.created` |
| Editar nombre o correo | ✅ | — | — | — | — | **Sí**² | `user.updated` |
| **Cambiar rol** | 🔸³ | — | — | — | — | **Sí** | `user.role.changed` |
| Deshabilitar / habilitar | 🔸³ | — | — | — | — | **Sí** | `user.disabled` / `user.enabled` |
| Desbloquear cuenta | ✅ | — | — | — | — | **Sí** | `auth.account.unlocked` |
| Restablecer contraseña (temporal) | ✅ | — | — | — | — | **Sí** | `auth.password.reset` |
| Revocar huella de otro usuario (dispositivo perdido) | ✅ | — | — | — | — | **Sí** | `webauthn.credential.revoked` |

¹ El Auditor ve usuarios solo a través del reporte "Usuarios y roles" (sin correo completo).
² El correo es el destino del código de segundo factor; cambiarlo sin re-autenticación permitiría secuestrar la cuenta.
³ No sobre sí mismo, y nunca si deja el sistema sin Administradores activos.

### 3.3 Inventario

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Consultar productos y existencias | — | ✅ | ✅ | ✅ | — | No | — |
| Crear producto | — | — | — | 🔸⁴ | — | No | `product.created` |
| Editar producto (nombre, precio, mínimo, estado) | — | — | — | ✅ | — | No | `product.updated` (precio anterior y nuevo) |
| **Marcar / desmarcar como controlado** | — | ✅ | — | — | — | **Sí** | `product.controlled.changed` |
| Registrar entrada de mercadería (lote) | — | ✅ | — | ✅ | — | No | `inventory.receipt` |
| Ver lotes y vencimientos | — | ✅ | — | ✅ | — | No | — |
| Ver kardex (movimientos) | — | ✅ | — | ✅ | 🔸⁵ | No | — |
| **Ajustar inventario — no controlado** | — | ✅ | — | ✅ | — | **Sí** + motivo | `inventory.adjustment` |
| **Ajustar inventario — controlado** | — | ✅ | — | — | — | **Sí** + motivo | `inventory.adjustment` (`isControlled: true`) |

⁴ Un producto nuevo siempre nace como **no controlado** si lo crea el Bodeguero; si debe ser controlado, el Regente lo marca después (con 2FA). Así el Bodeguero no puede crear ni desmarcar controlados.
⁵ El Auditor ve los ajustes a través del reporte "Ajustes de inventario".

### 3.4 Ventas

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Registrar venta (no controlados) | — | ✅ | ✅ | — | — | No | `sale.created` (ver D-26) |
| Incluir un producto controlado en una venta de mostrador | — | — | — | — | — | — | `authz.denied` |
| Ver mis ventas del día | — | ✅ | ✅ | — | — | No | — |
| Ver todas las ventas | — | ✅ | — | — | — | No | — |
| **Anular venta** | — | ✅ | — | — | — | **Sí** + motivo | `sale.voided` |

### 3.5 Clientes y fidelización

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Buscar cliente por teléfono o correo (resultado enmascarado) | — | ✅ | ✅ | — | — | No | — |
| Registrar cliente (**consentimiento obligatorio**) | — | ✅ | ✅ | — | — | No | `customer.created` (versión del aviso aceptado) |
| Ver detalle del cliente (contacto descifrado, puntos) | — | ✅ | ✅ | — | — | No | `customer.viewed` |
| Corregir datos (rectificación) | — | ✅ | ✅ | — | — | No | `customer.updated` |
| Registrar retiro del consentimiento (anonimiza) | — | ✅ | — | — | — | No | `customer.consent.withdrawn` |

### 3.6 Recetas y despacho

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Listar recetas (folio, fecha, estado; sin datos clínicos) | — | ✅ | — | — | — | No | — |
| **Ver receta** (descifrada) | — | ✅ | — | — | — | No | `prescription.viewed` |
| Registrar receta | — | ✅ | — | — | — | No | `prescription.created` |
| Anular receta | — | ✅ | — | — | — | No (motivo) | `prescription.cancelled` |
| Despachar receta sin controlados | — | ✅ | — | — | — | No | `prescription.dispensed` |
| **Despachar controlados** | — | ✅ | — | — | — | **Sí** | `prescription.dispensed` (`hasControlled: true`) |

### 3.7 Bitácora y reportes

| Acción | Admin | Regente | Cajero | Bodeguero | Auditor | 2FA | Bitácora |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Consultar bitácora con filtros | — (D-13) | — | — | — | ✅ | No | `audit.viewed` |
| Verificar integridad de la cadena | — | — | — | — | ✅ | No | `audit.verified` (resultado y último `seq`) |
| Reporte de intentos fallidos | — | — | — | — | ✅ | No | `report.viewed` |
| Reporte de usuarios y roles | ✅ | — | — | — | ✅ | No | `report.viewed` |
| Reporte de anulaciones | — | ✅ | — | — | ✅ | No | `report.viewed` |
| Reporte de ajustes de inventario | — | ✅ | — | ✅ | ✅ | No | `report.viewed` |
| Reporte de despachos de controlados (seudonimizado) | — | ✅ | — | — | 🔸 D-17 | No | `report.viewed` |
| **Exportar a CSV** (bitácora o reporte) | — | — | — | — | ✅ | No | `audit.exported` / `report.exported` (filtros y n.º de filas) |
| Modificar o borrar la bitácora | — | — | — | — | — | — | Imposible: no hay endpoint y la BD lo impide |

## 4. Catálogo de eventos de bitácora

| Evento | Resultado posible | Entidad | Cuándo |
|---|---|---|---|
| `auth.password.success` | success | user | Contraseña correcta (primer factor). |
| `auth.login.failure` | failure | user \| null | Usuario inexistente, contraseña incorrecta, cuenta bloqueada o deshabilitada (motivo en `details.reason`, nunca en la respuesta). |
| `auth.login.success` | success | user | Segundo factor completado. |
| `auth.account.locked` | success | user | 5.º intento fallido. |
| `auth.account.unlocked` | success | user | Desbloqueo por el Administrador. |
| `auth.mfa.webauthn.success` / `.failure` | success / failure | user | Huella en el login. |
| `auth.mfa.email.sent` | success / failure | user | Código enviado (o fallo de envío). |
| `auth.mfa.email.success` / `.failure` | success / failure | user | Código en el login. |
| `auth.mfa.email.exhausted` | failure | user | Se agotaron los 5 intentos de un código. |
| `auth.stepup.granted` / `auth.stepup.failed` | success / failure | según `action` | Re-autenticación (con `action`, `targetId`, `method`). |
| `auth.logout` | success | user | Cierre de sesión voluntario. |
| `auth.password.changed` / `auth.password.reset` | success / failure | user | Cambio propio / restablecimiento por el Administrador. |
| `webauthn.credential.registered` / `.revoked` | success / failure | webauthn_credential | Alta o baja de una huella. |
| `webauthn.counter.anomaly` | failure | webauthn_credential | El contador de firmas retrocedió (posible clonación). |
| `user.created` / `user.updated` / `user.role.changed` / `user.disabled` / `user.enabled` | success / failure | user | Administración de cuentas (`fromRole`, `toRole`, `reason`). |
| `authz.denied` | denied | según ruta | Acceso por rol no autorizado o re-autenticación ausente. |
| `security.origin.rejected` | denied | — | Escritura con `Origin` distinto de `CLIENT_ORIGIN`. |
| `security.rate_limited` | denied | — | Límite de peticiones en login o envío de códigos. |
| `product.created` / `product.updated` / `product.controlled.changed` | success / failure | product | Catálogo. |
| `inventory.receipt` / `inventory.adjustment` | success / failure | inventory_lot | Entradas y ajustes (`quantityDelta`, `reasonCode`, `stepUpMethod`). |
| `sale.created` / `sale.voided` | success / failure | sale | Ventas y anulaciones. |
| `customer.created` / `customer.viewed` / `customer.updated` / `customer.consent.withdrawn` | success / failure | customer | Fidelización (`noticeVersion`, sin datos de contacto). |
| `prescription.created` / `prescription.viewed` / `prescription.cancelled` / `prescription.dispensed` | success / failure | prescription | Recetas (sin datos clínicos en `details`). |
| `audit.viewed` / `audit.exported` / `audit.verified` | success / failure | audit_log | Uso de la bitácora (`filters`, `rows`, `lastSeq`, `brokenAtSeq`). |
| `report.viewed` / `report.exported` | success | report | Reportes (`report`, `filters`, `rows`). |

**Limitación conocida**: la expiración de una sesión por inactividad no genera evento, porque ocurre en la base de datos (TTL) sin una petición del usuario. Se documentará en `limitaciones-conocidas.md`.

## 5. Revisión de accesos

El reporte "Usuarios y roles" (con exportación CSV) sirve de insumo para la revisión trimestral de accesos del control 5.18. La revisión en sí es un procedimiento: queda como "solo documentado".
