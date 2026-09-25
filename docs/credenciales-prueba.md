# Credenciales de prueba

> Solo **datos ficticios**. Estas credenciales se crean solas la primera vez que ejecutas `npm run dev` en `farmacentro-backend` con la base vacía (o con `npm run seed -- --reset`), en un ambiente **de desarrollo local**.
> El repositorio es público: **no uses esta contraseña en un despliegue accesible desde Internet.** En producción, `scripts/seed.ts` se niega a correr sin `SEED_PASSWORD` y obliga a cada usuario a cambiar su contraseña al entrar.

## Usuarios (desarrollo local)

Contraseña de demostración para todos: `FarmaCentro-Demo-2026!`

| Usuario | Rol | Correo (recibe los códigos) | Pantalla de inicio |
|---|---|---|---|
| `admin` | Administrador | admin@farmacentro.test | Usuarios |
| `regente` | Regente | regente@farmacentro.test | Punto de venta |
| `cajero` | Cajero | cajero@farmacentro.test | Punto de venta |
| `bodeguero` | Bodeguero | bodeguero@farmacentro.test | Inventario |
| `auditor` | Auditor | auditor@farmacentro.test | Bitácora |

Los correos `@farmacentro.test` no existen: en desarrollo (`MAIL_TRANSPORT=console`), el código de 6 dígitos aparece en la **terminal del backend** (`npm run dev` en `farmacentro-backend`).

## Datos sembrados

- 11 productos, 3 de ellos controlados (Clonazepam, Tramadol, Alprazolam), con dos lotes cada uno y un lote vencido de Loratadina.
- 3 clientes de fidelización con consentimiento: María Fernanda López (55510001), José Ramírez (55510002) y Lucía Hernández (55510003).
- 2 ventas (una anulada por el Regente) y la receta `R-000001`, despachada parcialmente.

## Despliegue para el grupo auditor

Las credenciales del ambiente desplegado **no se escriben en este repositorio**. Allí los correos deben ser reales, porque el código se envía por SMTP. Se entregan al grupo auditor por un canal privado, junto con el ancla de la bitácora (decisión D-10).
