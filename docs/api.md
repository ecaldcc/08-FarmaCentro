# API REST

> Documento de diseño (versión inicial, 24/09/2026). Los esquemas están escritos en notación Zod 4 como **especificación**; no son el código final.
> Controles: 5.15, 5.17, 8.5, 8.15, 8.28.

## 1. Convenciones generales

- Base: `/api`. Solo JSON (`Content-Type: application/json` obligatorio en `POST/PUT/PATCH/DELETE`; si no, 415). Cuerpo máximo 100 kB.
- Autenticación: cookie de sesión `fc.sid`. No hay tokens en cabeceras ni en el cuerpo.
- Toda escritura pasa por `verifyOrigin` (`Origin` = `CLIENT_ORIGIN`).
- **Orden de middlewares por ruta**: `rateLimit?` → `requireAuth` → `requireRole(...)` → `validate({ params, query, body })` → `requireStepUp(action)?` → controlador. La validación ocurre antes de la re-autenticación para no gastar un segundo factor en una petición inválida.
- Todos los esquemas son `z.strictObject(...)`: un campo no declarado → 400. Los controladores solo leen `req.validated`.
- Errores: `{ "error": { "code", "message", "requestId", "fields"? } }`. Códigos en `arquitectura.md` §11.
- Una respuesta 403 por rol genera `authz.denied`; una 403 por falta de re-autenticación **no** genera evento (es parte del flujo normal), pero un intento de re-autenticación fallido sí (`auth.stepup.failed`).
- Paginación: `{ items: [...], page, pageSize, total }`.
- Columna **2FA**: "Sí (`acción`)" indica que se exige un permiso de re-autenticación con esa `action` y con `targetId` = el `:id` de la ruta (o `null` si la operación no tiene registro previo).

### 1.1 Esquemas comunes

```ts
ObjectId   = z.string().regex(/^[a-f0-9]{24}$/)
Username   = z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/)
Password   = z.string().min(12).max(128)
               .refine(s => Buffer.byteLength(s, 'utf8') <= 72)      // límite real de bcrypt
               // + reglas del servicio: no contener el username; no estar en la lista prohibida (D-20)
Email      = z.email().max(254).toLowerCase()
Role       = z.enum(['admin', 'regente', 'cajero', 'bodeguero', 'auditor'])
Reason     = z.string().trim().min(10).max(300)
Cents      = z.int().positive().max(100_000_000)
Qty        = z.int().positive().max(10_000)
Code6      = z.string().regex(/^\d{6}$/)
PhoneGT    = z.string().regex(/^\d{8}$/)
IsoDate    = z.iso.date()                                           // "2026-09-24"
DateRange  = z.strictObject({ from: IsoDate, to: IsoDate })         // + refine: from <= to, máx. 366 días
Page       = z.strictObject({ page: z.coerce.number().int().min(1).max(1000).default(1),
                              pageSize: z.coerce.number().int().min(1).max(100).default(25) })
StepUpAction = z.enum(['webauthn.register', 'webauthn.revoke', 'user.create', 'user.update',
                       'user.role.change', 'user.status.change', 'user.unlock', 'user.password.reset',
                       'user.webauthn.revoke', 'product.controlled.change', 'inventory.adjust',
                       'sale.void', 'prescription.dispense'])
// Respuestas de WebAuthn: forma JSON de @simplewebauthn/browser, validada estrictamente
WebAuthnAuthResponse = z.strictObject({
  id: z.string().max(1024), rawId: z.string().max(1024), type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),  // no se usan extensiones; se ignora
  response: z.strictObject({ clientDataJSON: z.string().max(4096), authenticatorData: z.string().max(4096),
                             signature: z.string().max(1024), userHandle: z.string().max(512).optional() }) })
WebAuthnRegResponse  = /* análogo, con response.attestationObject y response.transports */
```

### 1.2 Límites de peticiones (`express-rate-limit`)

| Nombre | Rutas | Límite | Clave |
|---|---|---|---|
| `loginLimiter` | `POST /auth/login` | 10 / 15 min | IP |
| `mfaLimiter` | `…/webauthn/*/verify`, `…/email-otp/verify` | 10 / 15 min | IP + sesión |
| `otpSendLimiter` | `…/email-otp/send` | 5 / 15 min por IP · además 1 / 60 s y 5 / h por usuario (en el servicio) | IP / usuario |
| `apiLimiter` | resto de `/api` | 300 / 5 min | sesión o IP |

Al superarlo: 429 `RATE_LIMITED` y evento `security.rate_limited`. Esto es independiente del bloqueo de cuenta (5 fallos → 15 min).

## 2. Resumen de endpoints

| # | Método | Ruta | Roles | 2FA | Bitácora |
|---|---|---|---|---|---|
| 1 | GET | `/health` | público | No | — |
| 2 | POST | `/auth/login` | público | — | `auth.password.success` · `auth.login.failure` · `auth.account.locked` |
| 3 | POST | `/auth/webauthn/login/options` | sesión en etapa `password` | — | — |
| 4 | POST | `/auth/webauthn/login/verify` | etapa `password` | — | `auth.mfa.webauthn.*` · `auth.login.success` |
| 5 | POST | `/auth/email-otp/send` | etapa `password` | — | `auth.mfa.email.sent` |
| 6 | POST | `/auth/email-otp/verify` | etapa `password` | — | `auth.mfa.email.*` · `auth.login.success` |
| 7 | POST | `/auth/logout` | autenticado | No | `auth.logout` |
| 8 | GET | `/auth/me` | autenticado (incl. cambio obligatorio) | No | — |
| 9 | POST | `/auth/password/change` | autenticado (incl. cambio obligatorio) | No | `auth.password.changed` |
| 10 | POST | `/auth/step-up/webauthn/options` | autenticado | — | — |
| 11 | POST | `/auth/step-up/webauthn/verify` | autenticado | — | `auth.stepup.granted` / `.failed` |
| 12 | POST | `/auth/step-up/email-otp/send` | autenticado | — | `auth.mfa.email.sent` |
| 13 | POST | `/auth/step-up/email-otp/verify` | autenticado | — | `auth.stepup.granted` / `.failed` |
| 14 | GET | `/me/webauthn/credentials` | todos | No | — |
| 15 | POST | `/me/webauthn/register/options` | todos | Sí (`webauthn.register`) | — |
| 16 | POST | `/me/webauthn/register/verify` | todos | (consume el permiso de 15) | `webauthn.credential.registered` |
| 17 | DELETE | `/me/webauthn/credentials/:id` | todos | Sí (`webauthn.revoke`) | `webauthn.credential.revoked` |
| 18 | GET | `/users` | admin | No | — |
| 19 | GET | `/users/:id` | admin | No | — |
| 20 | POST | `/users` | admin | Sí (`user.create`) | `user.created` |
| 21 | PATCH | `/users/:id` | admin | Sí (`user.update`) | `user.updated` |
| 22 | PUT | `/users/:id/role` | admin | Sí (`user.role.change`) | `user.role.changed` |
| 23 | PUT | `/users/:id/status` | admin | Sí (`user.status.change`) | `user.disabled` / `user.enabled` |
| 24 | POST | `/users/:id/unlock` | admin | Sí (`user.unlock`) | `auth.account.unlocked` |
| 25 | POST | `/users/:id/password-reset` | admin | Sí (`user.password.reset`) | `auth.password.reset` |
| 26 | DELETE | `/users/:id/webauthn/:credId` | admin | Sí (`user.webauthn.revoke`) | `webauthn.credential.revoked` |
| 27 | GET | `/products` | regente, cajero, bodeguero | No | — |
| 28 | GET | `/products/:id` | regente, cajero, bodeguero | No | — |
| 29 | POST | `/products` | bodeguero | No | `product.created` |
| 30 | PATCH | `/products/:id` | bodeguero | No | `product.updated` |
| 31 | PUT | `/products/:id/controlled` | regente | Sí (`product.controlled.change`) | `product.controlled.changed` |
| 32 | GET | `/inventory/lots` | regente, bodeguero | No | — |
| 33 | GET | `/inventory/expiring` | regente, bodeguero | No | — |
| 34 | GET | `/inventory/movements` | regente, bodeguero | No | — |
| 35 | POST | `/inventory/receipts` | regente, bodeguero | No | `inventory.receipt` |
| 36 | POST | `/inventory/adjustments` | regente, bodeguero (solo no controlados) | Sí (`inventory.adjust`) | `inventory.adjustment` |
| 37 | POST | `/sales` | regente, cajero | No | `sale.created` |
| 38 | GET | `/sales` | regente (todas), cajero (propias del día) | No | — |
| 39 | GET | `/sales/:id` | regente, cajero (propia) | No | — |
| 40 | POST | `/sales/:id/void` | regente | Sí (`sale.void`) | `sale.voided` |
| 41 | GET | `/privacy-notice/current` | regente, cajero | No | — |
| 42 | GET | `/customers/lookup` | regente, cajero | No | — |
| 43 | POST | `/customers` | regente, cajero | No | `customer.created` |
| 44 | GET | `/customers/:id` | regente, cajero | No | `customer.viewed` |
| 45 | PATCH | `/customers/:id` | regente, cajero | No | `customer.updated` |
| 46 | POST | `/customers/:id/consent-withdrawal` | regente | No | `customer.consent.withdrawn` |
| 47 | GET | `/prescriptions` | regente | No | — |
| 48 | GET | `/prescriptions/:id` | regente | No | `prescription.viewed` |
| 49 | POST | `/prescriptions` | regente | No | `prescription.created` |
| 50 | POST | `/prescriptions/:id/cancel` | regente | No | `prescription.cancelled` |
| 51 | POST | `/prescriptions/:id/dispense` | regente | Sí (`prescription.dispense`) si hay controlados | `prescription.dispensed` |
| 52 | GET | `/audit/logs` | auditor | No | `audit.viewed` |
| 53 | GET | `/audit/logs/export` | auditor | No | `audit.exported` |
| 54 | GET | `/audit/verify` | auditor | No | `audit.verified` |
| 55 | GET | `/reports/failed-logins` | auditor | No | `report.viewed` / `report.exported` |
| 56 | GET | `/reports/users-roles` | admin, auditor | No | `report.viewed` / `report.exported` |
| 57 | GET | `/reports/voids` | regente, auditor | No | `report.viewed` / `report.exported` |
| 58 | GET | `/reports/adjustments` | regente, bodeguero, auditor | No | `report.viewed` / `report.exported` |
| 59 | GET | `/reports/controlled-dispensations` | regente, auditor (D-17) | No | `report.viewed` / `report.exported` |

Los reportes 55–59 aceptan `format=csv`; solo el Auditor puede pedir CSV (los demás roles reciben 403).

## 3. Detalle por módulo

### 3.1 Salud del servicio

**1. `GET /health`** — 200 `{ status: "ok" }`. No revela versión, entorno ni estado de la base de datos.

### 3.2 Autenticación

**2. `POST /auth/login`** · `loginLimiter`
```ts
body = z.strictObject({ username: Username, password: z.string().min(1).max(128) })
```
- 200 `{ next: "mfa", methods: ("webauthn" | "email")[] }` (`webauthn` solo si el usuario tiene huellas activas). Regenera el id de sesión; `authStage = "password"`, vence en 5 min.
- 401 `INVALID_CREDENTIALS`, mismo mensaje y tiempo de respuesta aproximado para: usuario inexistente, contraseña incorrecta, cuenta bloqueada y cuenta deshabilitada.
- Efectos: fallo → `$inc failedLoginCount`; al 5.º → `lockedUntil = ahora + 15 min`, reinicia el contador, correo de aviso al usuario, evento `auth.account.locked`.

**3. `POST /auth/webauthn/login/options`** · body `z.strictObject({})`
- 200 `PublicKeyCredentialRequestOptionsJSON` (`userVerification: "required"`, `allowCredentials` = huellas activas, `timeout: 60000`). Desafío en sesión, 2 min, un solo uso.
- 401 `UNAUTHENTICATED` si la sesión no está en etapa `password`.

**4. `POST /auth/webauthn/login/verify`** · `mfaLimiter`
```ts
body = z.strictObject({ response: WebAuthnAuthResponse })
```
- Verificación: `expectedChallenge` (de la sesión), `expectedOrigin = CLIENT_ORIGIN`, `expectedRPID = RP_ID`, `requireUserVerification: true`, credencial del mismo usuario y no revocada, contador mayor al guardado (si ambos son distintos de 0).
- 200 `{ user: { id, username, fullName, role, mustChangePassword }, sessionExpiresAt }`. Regenera la sesión; `authStage = "authenticated"`.
- 401 genérico. Un fallo cuenta para el bloqueo. Contador que retrocede → `webauthn.counter.anomaly`.

**5. `POST /auth/email-otp/send`** · `otpSendLimiter`
```ts
body = z.strictObject({})     // el propósito "login" lo determina la etapa de la sesión
```
- 200 `{ expiresAt, sentTo: "e***@dominio.com" }` (correo enmascarado; **nunca** el código).
- 429 si se pide antes de 60 s o se superan 5 por hora.
- Invalida el código vigente anterior del usuario.

**6. `POST /auth/email-otp/verify`** · `mfaLimiter`
```ts
body = z.strictObject({ code: Code6 })
```
- 200 igual que 4. 401 genérico. Tras 5 intentos fallidos el código se invalida, se avisa por correo y se registra `auth.mfa.email.exhausted`.

**7. `POST /auth/logout`** — body `{}` · 204. Destruye la sesión en `sessions` y borra la cookie.

**8. `GET /auth/me`** — 200 `{ user: { id, username, fullName, role, mustChangePassword, hasWebAuthn }, permissions: string[], sessionExpiresAt }`. `permissions` solo sirve para que el cliente oculte opciones. Como toda petición autenticada, renueva la sesión; por eso el cliente solo la llama al cargar y al pulsar "Seguir trabajando", nunca en sondeos. Cada respuesta autenticada trae la cabecera `X-Session-Expires-At`.

**9. `POST /auth/password/change`**
```ts
body = z.strictObject({ currentPassword: z.string().min(1).max(128), newPassword: Password })
  .refine(b => b.newPassword !== b.currentPassword)
```
- 204. Regenera la sesión, pone `mustChangePassword = false`, envía aviso por correo. 400 si la actual es incorrecta (cuenta para el bloqueo).

**10. `POST /auth/step-up/webauthn/options`**
```ts
body = z.strictObject({ action: StepUpAction, targetId: ObjectId.nullable() })
```
- 200 opciones de WebAuthn con el desafío ligado a `action` + `targetId` (2 min). 409 si el usuario no tiene huellas.

**11. `POST /auth/step-up/webauthn/verify`** · `mfaLimiter`
```ts
body = z.strictObject({ response: WebAuthnAuthResponse })
```
- 200 `{ action, targetId, grantExpiresAt }`. Guarda `stepUpGrant` en la sesión (un solo uso, 2 min). 401 genérico en fallo.

**12. `POST /auth/step-up/email-otp/send`** · `otpSendLimiter` — body como 10. 200 `{ expiresAt, sentTo }`. 403 si la política (D-03) no permite correo para esa `action`.

**13. `POST /auth/step-up/email-otp/verify`** · `mfaLimiter` — body `{ action, targetId, code: Code6 }` (la acción y el registro deben coincidir con los del código enviado). Respuestas como 11.

### 3.3 Huellas de la cuenta propia

**14. `GET /me/webauthn/credentials`** — 200 `[{ id, nickname, createdAt, lastUsedAt, deviceType }]` (solo activas; nunca la clave pública).

**15. `POST /me/webauthn/register/options`** · 2FA `webauthn.register` (`targetId: null`)
```ts
body = z.strictObject({ nickname: z.string().trim().min(1).max(50) })
```
- 200 `PublicKeyCredentialCreationOptionsJSON` con `authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "discouraged", userVerification: "required" }`, `attestationType: "none"`, `excludeCredentials` = huellas ya registradas. Máximo 5 huellas activas por usuario (409).
- Nota: en el primer ingreso el usuario entra con código por correo y la re-autenticación también será por correo.

**16. `POST /me/webauthn/register/verify`**
```ts
body = z.strictObject({ response: WebAuthnRegResponse })
```
- 201 `{ id, nickname, createdAt }`. Exige `requireUserVerification: true`. Aviso por correo "se registró una nueva huella en tu cuenta".

**17. `DELETE /me/webauthn/credentials/:id`** · 2FA `webauthn.revoke` · params `{ id: ObjectId }` — 204. No se permite revocar la última huella si la política D-03 exige huella para operaciones sensibles del rol (409).

### 3.4 Usuarios (Administrador)

**18. `GET /users`**
```ts
query = Page.extend({ role: Role.optional(), status: z.enum(['active','disabled']).optional(),
                      q: z.string().trim().max(50).regex(/^[\p{L}\p{N} ._-]*$/u).optional() })
```
- 200 paginado `{ id, username, fullName, role, status, locked, hasWebAuthn, lastLoginAt }`. La búsqueda `q` se escapa antes de usarse en una expresión regular.

**19. `GET /users/:id`** — 200 detalle + huellas activas (`id`, `nickname`, `lastUsedAt`). 404.

**20. `POST /users`** · 2FA `user.create`
```ts
body = z.strictObject({ username: Username, fullName: z.string().trim().min(3).max(100),
                        email: Email, role: Role })
```
- 201 `{ user, temporaryPassword }`. La contraseña temporal (16 caracteres aleatorios) se muestra **una sola vez** y no se registra en la bitácora ni en los logs; `mustChangePassword = true`. 409 si el username o el correo ya existen.

**21. `PATCH /users/:id`** · 2FA `user.update`
```ts
body = z.strictObject({ fullName: z.string().trim().min(3).max(100).optional(), email: Email.optional() })
  .refine(b => Object.keys(b).length > 0)
```
- 200 usuario. Si cambia el correo se avisa **al correo anterior y al nuevo**.

**22. `PUT /users/:id/role`** · 2FA `user.role.change`
```ts
body = z.strictObject({ role: Role, reason: Reason })
```
- 200. 409 si `:id` es el propio Administrador o si dejaría 0 Administradores activos. Evento con `fromRole`, `toRole`, `reason`. El cambio surte efecto en la siguiente petición del afectado (`loadUser`).

**23. `PUT /users/:id/status`** · 2FA `user.status.change`
```ts
body = z.strictObject({ status: z.enum(['active', 'disabled']), reason: Reason })
```
- 200. Mismas restricciones que 22. Deshabilitar corta la sesión del afectado en su siguiente petición.

**24. `POST /users/:id/unlock`** · 2FA `user.unlock` · body `{ reason: Reason }` — 204. Pone `lockedUntil = null`, `failedLoginCount = 0`.

**25. `POST /users/:id/password-reset`** · 2FA `user.password.reset` · body `{ reason: Reason }` — 200 `{ temporaryPassword }` (una sola vez); `mustChangePassword = true`; aviso por correo al usuario.

**26. `DELETE /users/:id/webauthn/:credId`** · 2FA `user.webauthn.revoke` · body `{ reason: Reason }` — 204. Aviso por correo.

### 3.5 Productos e inventario

**27. `GET /products`**
```ts
query = Page.extend({ q: z.string().trim().max(50).optional(), isControlled: z.stringbool().optional(),
                      status: z.enum(['active','inactive']).default('active'), lowStock: z.stringbool().optional() })
```
- 200 paginado `{ id, sku, name, presentation, unitPriceCents, isControlled, stock, minStock, status }` (`stock` = suma de lotes no vencidos).

**28. `GET /products/:id`** — 200 producto + lotes no vencidos (`lotNumber`, `expiresAt`, `quantity`).

**29. `POST /products`**
```ts
body = z.strictObject({ sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/),
  name: z.string().trim().min(2).max(120), activeIngredient: z.string().trim().max(120).optional(),
  presentation: z.string().trim().min(2).max(120),
  category: z.enum(['medicamento','cuidado_personal','otros']), unitPriceCents: Cents,
  minStock: z.int().min(0).max(100_000) })
```
- 201 producto con `isControlled: false`. 409 SKU duplicado.

**30. `PATCH /products/:id`** — body: los mismos campos opcionales, excepto `sku`, más `status`. No acepta `isControlled` (400 por `strictObject`). Evento con valores anterior y nuevo del precio.

**31. `PUT /products/:id/controlled`** · 2FA `product.controlled.change`
```ts
body = z.strictObject({ isControlled: z.boolean(), reason: Reason })
```

**32. `GET /inventory/lots`** — query `Page.extend({ productId: ObjectId.optional(), includeExpired: z.stringbool().default(false) })`.

**33. `GET /inventory/expiring`** — query `{ withinDays: z.coerce.number().int().min(1).max(365).default(60) }` · 200 lotes que vencen en ese plazo o ya vencidos con existencia.

**34. `GET /inventory/movements`** — query `Page.extend({ productId: ObjectId.optional(), type: z.enum([...]).optional(), from: IsoDate.optional(), to: IsoDate.optional() })`.

**35. `POST /inventory/receipts`** — transacción
```ts
body = z.strictObject({ productId: ObjectId, lotNumber: z.string().trim().min(1).max(40),
  expiresAt: IsoDate /* refine: futura */, quantity: Qty, supplier: z.string().trim().max(100).optional(),
  documentRef: z.string().trim().max(40).optional() })
```
- 201 `{ lot, movement }`. Si el lote existe con otra fecha de vencimiento → 409.

**36. `POST /inventory/adjustments`** · 2FA `inventory.adjust` (`targetId` = `lotId`) · transacción
```ts
body = z.strictObject({ lotId: ObjectId, quantityDelta: z.int().min(-10_000).max(10_000).refine(n => n !== 0),
  reasonCode: z.enum(['damaged','expired','count_correction','loss','other']), reason: Reason })
```
- 201 `{ lot, movement }`. 403 si el producto es controlado y el rol no es `regente`. 409 si la existencia quedaría negativa.

### 3.6 Ventas

**37. `POST /sales`** — transacción
```ts
body = z.strictObject({
  customerId: ObjectId.optional(),
  items: z.array(z.strictObject({ productId: ObjectId, quantity: Qty })).min(1).max(50)
          .refine(sin productId repetidos),
  payment: z.discriminatedUnion('method', [
    z.strictObject({ method: z.literal('cash'), amountReceivedCents: Cents }),
    z.strictObject({ method: z.literal('card_simulated') })      // sin NINGÚN dato de tarjeta
  ]) })
```
- El precio y el total se toman de la base de datos, nunca del cliente. Lotes por FEFO excluyendo vencidos.
- 201 `{ sale }` con `authorizationRef: "SIM-…"` si fue tarjeta simulada.
- 403 si algún producto es controlado (los controlados solo salen por despacho con receta). 409 existencias insuficientes o efectivo menor al total.

**38. `GET /sales`** — query `Page.extend({ from: IsoDate.optional(), to: IsoDate.optional(), status: z.enum(['completed','voided']).optional() })`. Para `cajero` el servicio fuerza `cashierId = yo` y la fecha de hoy.

**39. `GET /sales/:id`** — 404 (no 403) si un cajero pide una venta ajena, para no revelar su existencia.

**40. `POST /sales/:id/void`** · 2FA `sale.void` · transacción
```ts
body = z.strictObject({ reason: Reason })
```
- 200 `{ sale }`. 409 si ya está anulada o fuera del plazo permitido (D-07).

### 3.7 Clientes y fidelización

**41. `GET /privacy-notice/current`** — 200 `{ version: "2026-09-v1", text }` (texto del aviso de privacidad que se muestra antes de registrar).

**42. `GET /customers/lookup`**
```ts
query = z.strictObject({ phone: PhoneGT.optional(), email: Email.optional() }).refine(exactamente uno)
```
- Busca por índice ciego. 200 `{ id, fullName, phoneMasked: "****-5678", pointsBalance }` o 404.

**43. `POST /customers`**
```ts
body = z.strictObject({ fullName: z.string().trim().min(3).max(100), phone: PhoneGT, email: Email.optional(),
  consent: z.strictObject({ accepted: z.literal(true), noticeVersion: z.string().max(20) }) })
```
- 400 si `consent.accepted` no es `true` o si `noticeVersion` no es la vigente. 409 si el teléfono ya está registrado.

**44. `GET /customers/:id`** — 200 con contacto descifrado y últimos movimientos de puntos (sin detalle de productos comprados).

**45. `PATCH /customers/:id`** — body opcional `{ fullName?, phone?, email? }` (al menos uno).

**46. `POST /customers/:id/consent-withdrawal`** — body `{ reason: Reason }` · 200. Anonimiza `fullName` y borra (`$unset`) el contacto cifrado y los índices ciegos; conserva el historial de puntos sin identificación.

### 3.8 Recetas (solo Regente)

**47. `GET /prescriptions`** — query `Page.extend({ folio: z.string().regex(/^R-\d{6}$/).optional(), status: z.enum([...]).optional(), from: IsoDate.optional(), to: IsoDate.optional() })` · 200 `{ id, folio, issuedAt, status, hasControlled, createdAt }` (**sin** descifrar).

**48. `GET /prescriptions/:id`** — 200 receta descifrada · registra `prescription.viewed`.

**49. `POST /prescriptions`**
```ts
body = z.strictObject({ customerId: ObjectId.optional(),
  patientName: z.string().trim().min(3).max(100), doctorName: z.string().trim().min(3).max(100),
  doctorLicense: z.string().trim().min(1).max(20), issuedAt: IsoDate /* no futura */,
  items: z.array(z.strictObject({ productId: ObjectId, dosage: z.string().trim().min(1).max(200),
                                  quantityPrescribed: Qty })).min(1).max(20),
  notes: z.string().trim().max(500).optional() })
```
- 201 `{ id, folio }`. El servicio calcula `hasControlled` y cifra antes de guardar.

**50. `POST /prescriptions/:id/cancel`** — body `{ reason: Reason }` · 409 si ya fue despachada.

**51. `POST /prescriptions/:id/dispense`** · 2FA `prescription.dispense` (si algún ítem es controlado) · transacción
```ts
body = z.strictObject({
  items: z.array(z.strictObject({ productId: ObjectId, quantity: Qty })).min(1).max(20),
  payment: /* mismo discriminatedUnion que en /sales */ })
```
- Valida que cada producto esté en la receta y que no se despache más de lo prescrito (sumando despachos anteriores). Crea venta + despacho + movimientos.
- 201 `{ dispensationId, sale }`. 409 receta anulada, vencida (D-16) o cantidades excedidas.

### 3.9 Bitácora y reportes

**52. `GET /audit/logs`**
```ts
query = Page.extend({ from: IsoDate.optional(), to: IsoDate.optional(),
  action: z.string().regex(/^[a-z_.]{3,60}$/).optional(), userId: ObjectId.optional(),
  username: Username.optional(), result: z.enum(['success','failure','denied']).optional(),
  entity: z.string().regex(/^[a-z_]{2,30}$/).optional(), entityId: z.string().max(64).optional() })
```
- 200 paginado, orden `seq` descendente. Cada consulta registra `audit.viewed` con los filtros.

**53. `GET /audit/logs/export`** — mismo query sin paginación (máx. 50 000 filas; si hay más → 400 pidiendo acotar el rango). Respuesta `text/csv; charset=utf-8` con BOM y `Content-Disposition: attachment; filename="bitacora_<desde>_<hasta>.csv"`. Incluye `seq`, `prevHash` y `hash` para verificar fuera del sistema. **Protección contra inyección de fórmulas**: toda celda que empiece por `=`, `+`, `-`, `@`, tabulador o retorno de carro se antepone con `'`.

**54. `GET /audit/verify`** — 200 `{ ok: boolean, checked: number, lastSeq, lastHash, brokenAtSeq?: number, reason?: "hash" | "prevHash" | "gap" }`.

**55–59. Reportes** — query común `DateRange.extend({ format: z.enum(['json','csv']).default('json') })` (el 56 no usa rango).

| # | Reporte | Columnas |
|---|---|---|
| 55 | Intentos fallidos | fecha, usuario intentado, IP, user agent, motivo (`bad_password`, `unknown_user`, `locked`, `disabled`, `mfa_failed`), bloqueos resultantes |
| 56 | Usuarios y roles | usuario, nombre, rol, estado, bloqueado, n.º de huellas, último acceso, último cambio de rol (fecha y quién) |
| 57 | Anulaciones | n.º de venta, fecha de venta, total, cajero, anulada por, fecha de anulación, motivo, método de 2FA |
| 58 | Ajustes de inventario | fecha, producto, lote, controlado, cantidad, código y motivo, usuario, método de 2FA |
| 59 | Despachos de controlados | fecha, folio, producto, lote, cantidad, regente, método de 2FA (**sin** datos del paciente ni del médico) |

## 4. Facturación (agregado el 25/09/2026)

**`POST /sales`** y **`POST /prescriptions/:id/dispense`** aceptan además:

```ts
billing = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CF') }),
  z.strictObject({ type: z.literal('NIT'), taxId: NIT /* dígito verificador */, name: z.string().min(3).max(150).optional() }),
  z.strictObject({ type: z.literal('CUI'), taxId: CUI /* 13 dígitos */, name: z.string().min(3).max(150).optional() }),
]).default({ type: 'CF' })
```

- Total ≥ Q2,500.00 con `CF` → 400 (`body.billing.type`), sin tocar existencias.
- NIT/DPI no registrado y sin `name` → 400 (`body.billing.name`). Con `name`, se registra cifrado (evento `billing_party.created`) dentro de la transacción de la venta.
- La respuesta incluye `billing: { type, name, taxIdDisplay }` y `customerName` (cliente de fidelización, si hay). `GET /sales/:id` y las respuestas de crear, anular y despachar devuelven el DPI completo (formato `1234 56789 0101`); `GET /sales` lo devuelve enmascarado. Cada `GET /sales/:id` de una venta con DPI registra `billing_party.viewed`.

**60. `GET /billing-parties/lookup`** · roles regente, cajero

```ts
query = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('NIT'), taxId: NIT }),
  z.strictObject({ type: z.literal('CUI'), taxId: CUI }),
])
```

- 200 `{ type, name, taxIdDisplay }` o 404 si no está registrado. Cada consulta genera `billing_party.viewed`, porque revela el nombre asociado a un número de identificación.
