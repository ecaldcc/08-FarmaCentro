# Reglas de la auditoría

> Documento para el grupo auditor (11/10/2026). Define qué se audita, con qué cuentas, qué pruebas están permitidas y cómo se reportan los hallazgos. Sistema académico: **solo datos ficticios**.

## 1. Alcance

| Elemento | Detalle |
|---|---|
| Aplicación | **https://farmacentro.netlify.app** (cliente en Netlify, API en Render a través de `https://farmacentro.netlify.app/api`, base en MongoDB Atlas) |
| Código fuente | [github.com/ecaldcc/08-FarmaCentro](https://github.com/ecaldcc/08-FarmaCentro) (público). Se puede clonar y ejecutar en local siguiendo el [manual de instalación](manual-instalacion.md). |
| Módulos | Autenticación y segundo factor, usuarios y roles, inventario, ventas de mostrador y facturación, clientes y fidelización, recetas, bitácora de auditoría y reportes |
| Marco de referencia | ISO/IEC 27001:2022 con controles de ISO/IEC 27002:2022. El estado de cada control y su evidencia están en la [matriz de controles](matriz-controles.md). |
| Evidencias entregadas | Carpeta [`docs/evidencias`](evidencias): `npm audit` y privilegios de la base de datos (11/10/2026). El **ancla de la bitácora** (último `seq` y `hash`) se entrega por un canal privado (decisión D-10). |

## 2. Cuentas

Cada persona entra con **su propia cuenta**. Las contraseñas no se escriben en ningún documento.

| Usuario | Rol | Para quién |
|---|---|---|
| `ktobarm` | Administrador | Grupo auditor: crea las cuentas de cada rol que necesite para sus pruebas |
| `osagastumea1` | Administrador | Ing. Omar Eduardo Sagastume Álvarez |
| `admin` | Administrador | Equipo de desarrollo (cuenta compartida, ver D-31) |

Para probar los demás roles, el grupo auditor crea desde `ktobarm` una cuenta por rol en *Usuarios → Nuevo usuario*. Con Gmail pueden usar un solo buzón: `correo+cajero@gmail.com`, `correo+regente@gmail.com`, etc. El Administrador no vende ni ve recetas (segregación de funciones), así que esas pruebas se hacen con las cuentas de Regente y Cajero.

Las demás cuentas que aparecen en *Usuarios* (`henrynan`, `canchenan` y las cuentas demo deshabilitadas `regente`, `cajero`, `bodeguero` y `auditor`) no son parte de la auditoría.

**Primer ingreso:**
1. Llega un correo de FarmaCentro con el usuario y una **contraseña temporal válida 48 horas**. Si vence, pidan al equipo que use "Reenviar invitación".
2. En https://farmacentro.netlify.app escriban el usuario y la contraseña temporal.
3. Elijan "Enviarme un código por correo" y escriban el código de 6 dígitos (vence en 5 minutos).
4. El sistema pide elegir una contraseña propia: mínimo 12 caracteres, que no contenga el usuario.
5. En *Mi cuenta → App autenticadora*, configuren **Google Authenticator** o **Microsoft Authenticator**: se confirma una sola vez con un código por correo, se escanea el código QR y se escribe el código que muestra la app.

Desde entonces, cada ingreso pide contraseña y código por correo (o huella). Las **operaciones críticas** (crear usuarios y cambiar roles, anular ventas, ajustar inventario, despachar controlados) piden el código de la **app autenticadora**, nunca un correo (decisión D-32). Sin la app configurada, esas operaciones no se pueden hacer.

> **Primer acceso del día:** la API está en el plan gratuito de Render y se duerme tras 15 minutos sin uso. Si la primera carga falla, esperen un minuto y vuelvan a intentar.

## 3. Pruebas permitidas

- Recorrer todas las funciones con las cuentas asignadas y verificar que cada rol solo pueda hacer lo que dice la [matriz de roles](roles-permisos.md).
- Intentar acciones no autorizadas desde la interfaz o llamando la API directamente con la sesión de una cuenta asignada (por ejemplo, que el Cajero intente anular una venta o ver recetas).
- Probar validación de entradas e **inyección NoSQL** con cargas manuales (por ejemplo, `{"$ne": null}` en el usuario).
- Probar el **bloqueo por intentos** solo sobre `ktobarm` o las cuentas que ustedes creen: 5 contraseñas incorrectas bloquean la cuenta 15 minutos.
- Probar la **app autenticadora**: que un código solo sirva una vez, que el correo no se acepte para operaciones críticas y que los códigos incorrectos cuenten para el bloqueo.
- Probar la **expiración de sesión** (15 minutos de inactividad, 8 horas como máximo), el cierre de sesión y la re-autenticación.
- Revisar cabeceras de seguridad, cookies, CORS y la verificación de origen con las herramientas del navegador.
- Revisar la **bitácora** y los reportes con la cuenta de rol Auditor que creen, exportar a CSV y verificar la cadena de hash contra el ancla.
- Revisar el código fuente y ejecutar en local las pruebas automáticas (`npm test` en `farmacentro-backend`) o el sistema completo.
- Revisar la documentación y la evidencia frente a la matriz de controles.

## 4. Fuera de alcance y pruebas no permitidas

- **Denegación de servicio**, pruebas de carga o escáneres automáticos agresivos. La API tiene límites por IP (10 intentos de inicio de sesión cada 15 minutos y 300 peticiones cada 5 minutos) y corre en un plan gratuito. Un escáner automático solo se permite contra una copia local.
- Atacar la infraestructura de terceros: Netlify, Render, MongoDB Atlas, Brevo o GitHub.
- Ingeniería social o *phishing* contra el equipo o el ingeniero.
- Usar, bloquear o modificar cuentas que no sean `ktobarm` o las que ustedes creen. Aunque `ktobarm` es Administrador, no cambien el rol, el estado, la contraseña, la huella ni la app autenticadora de `admin`, `osagastumea1`, `henrynan` ni `canchenan`, ni habiliten las cuentas demo.
- Usar **datos personales reales** o datos reales de tarjetas. Todo es ficticio y el pago es simulado.
- Controles marcados como **solo documentado** (tienda en línea, modo de contingencia del POS, red/VLAN/firewall, terminales P2PE, EDR y los demás de [limitaciones conocidas](limitaciones-conocidas.md)). Se pueden evaluar como documentación, no como implementación.

Lo que ya aparece en [limitaciones conocidas](limitaciones-conocidas.md) está declarado. Se puede reportar si consideran insuficiente la mitigación, indicándolo en el hallazgo.

## 5. Plazo

Las fechas de inicio y de entrega del informe las indica el Ing. Sagastume.

Durante la auditoría, el equipo de desarrollo no cambia el sistema desplegado salvo para corregir algo que impida la auditoría. Cualquier cambio queda en el historial de Git y, si toca cuentas, en la bitácora.

## 6. Formato de hallazgos

Cada hallazgo se reporta con estos campos:

| Campo | Contenido |
|---|---|
| Id | `H-01`, `H-02`, … |
| Título | Una frase |
| Control | Número de ISO/IEC 27002:2022 (por ejemplo, 8.5) y fila de la matriz de controles, si aplica |
| Severidad | Crítica, Alta, Media, Baja o Informativa (tabla siguiente) |
| Descripción | Qué se encontró |
| Pasos para reproducir | Cuenta usada, pantalla o endpoint, datos enviados |
| Evidencia | Captura, respuesta de la API (con su `requestId`) o `seq` del registro de la bitácora |
| Impacto | Qué podría pasar en una farmacia real |
| Recomendación | Cómo corregirlo |

| Severidad | Criterio |
|---|---|
| **Crítica** | Permite entrar sin credenciales válidas o sin segundo factor, leer recetas sin ser Regente, o alterar la bitácora sin que la verificación lo detecte |
| **Alta** | Escalada de privilegios entre roles, saltar la re-autenticación de una operación sensible, inyección con efecto en los datos, exposición de datos cifrados |
| **Media** | Control implementado de forma incompleta o evidencia insuficiente; fuga de información limitada (por ejemplo, mensajes que revelan si un usuario existe) |
| **Baja** | Desviación de buenas prácticas con poco impacto (cabeceras, textos, configuración) |
| **Informativa** | Observación o mejora sin riesgo directo |

## 7. Contacto

Equipo de desarrollo: Edwar Daniel Calderón Cinco, José Eduardo Salguero Aquino y Henry David Cabrera Virula. Correo del sistema: farmacentro053@gmail.com.
