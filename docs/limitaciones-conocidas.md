# Limitaciones conocidas

> Versión inicial (25/09/2026). Lista lo que el prototipo **simula** o deja **solo documentado**, para que el grupo auditor no lo reporte como un hallazgo no declarado.

## Simulado

| Tema | Qué hace el prototipo | Cómo sería en producción |
|---|---|---|
| Pagos con tarjeta | Genera una referencia ficticia `SIM-XXXXXXXXXX`. No existe ningún campo de tarjeta y la API rechaza cualquier dato extra. | Terminal P2PE del procesador; FarmaCentro nunca ve la tarjeta. |
| Respaldo (8.13) | `npm run backup` exporta y cifra con AES-256-GCM; `npm run restore-test` restaura en una base temporal y verifica conteos y la cadena de la bitácora. | Respaldo diario fuera de sitio con prueba mensual. |
| Correo | En desarrollo (`MAIL_TRANSPORT=console`) los correos se muestran en la terminal del backend y no se envían. | SMTP real con SPF/DKIM. |
| Factura | El comprobante no tiene validez fiscal. | Factura electrónica FEL de la SAT (fuera de alcance). |

## Solo documentado (fuera de alcance)

Tienda en línea, modo de contingencia del POS, enlace 4G de respaldo, segmentación de red (VLAN/firewall), terminales P2PE, EDR/antimalware, cifrado de disco (BitLocker), parches de equipos, configuración CIS, seguridad física de la bodega, capacitación y simulaciones de phishing.

## Limitaciones técnicas del prototipo

1. **Huella o PIN (C-02):** WebAuthn con `userVerification: "required"` garantiza que el dispositivo verificó al usuario, pero el servidor no sabe si fue con huella o con el PIN de Windows Hello. La detección de ataques de presentación (ISO/IEC 30107-3) depende del lector.
2. **SMS:** el entregable menciona códigos por SMS; el prototipo solo implementa el correo.
3. **Una sola instancia de la API (D-09):** la cadena de la bitácora se serializa en memoria y los límites de peticiones usan un almacén en memoria. Con varias instancias habría que moverlos a la base de datos.
4. **Expiración de sesión sin evento:** la sesión vence por TTL en MongoDB, sin petición del usuario, así que no se registra un evento de "sesión expirada".
5. **Retención de 12 meses (C-05):** la API no puede borrar la bitácora, por lo que no se purga nada. La retención queda como procedimiento.
6. **Reescritura completa de la bitácora:** un administrador de Atlas podría reescribir toda la cadena. Se mitiga con el ancla (último `seq` y `hash`) que se entrega al grupo auditor fuera del sistema (D-10).
7. **Una sola sucursal (D-15):** no se modelan varias sucursales.
8. **Lista de contraseñas prohibidas reducida (D-20):** se incluye una lista corta de contraseñas comunes de 12 caracteres o más.
9. **MongoDB local sin usuarios:** en desarrollo la base local no tiene autenticación, por lo que no demuestra el rol personalizado de la API. Esa evidencia se genera contra Atlas con `npm run check-db-privileges`.
10. **Render gratis se duerme:** tras 15 minutos sin tráfico la API tarda de 30 a 60 segundos en despertar; la primera petición a través del proxy de Netlify (unos 26 s de espera) puede fallar. Se recomienda abrir `/api/health` antes de una sesión de auditoría.
11. **Acceso de red a Atlas:** si Render no ofrece IPs de salida fijas en la cuenta, la lista de acceso de Atlas queda en `0.0.0.0/0`. La protección recae en usuarios de base de datos con contraseñas largas, rol de mínimo privilegio y TLS obligatorio.
12. **Correo por Brevo:** Render gratis bloquea el SMTP, por lo que los códigos se envían por la API HTTPS de Brevo (plan gratuito de 300 correos diarios). Brevo es un proveedor más dentro del alcance de 5.19–5.22.
