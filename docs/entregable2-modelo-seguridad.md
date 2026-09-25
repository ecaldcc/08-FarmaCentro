Universidad Mariano Gálvez de Guatemala

Facultad de Ingeniería en Sistemas de Información

Curso: Seguridad y Auditoría de Sistemas

Ing. Omar Eduardo Sagastume Álvarez

Sección A

**Proyecto de Curso**

**Modelo de Seguridad de Sistemas de Información Auditable**

**para FarmaCentro**

Cadena de farmacias y retail de salud

Edwar Daniel Calderón Cinco – 9490-20-26601

José Eduardo Salguero Aquino – 9490-19-456

Henry David Cabrera Virula – 9490-20-6611

Guatemala, 23 de septiembre del 2026

**Índice**

**Introducción** 3

**1. Modelo de Negocio** 3

> 1.1 Planteamiento del Problema (Situación Actual) 5
>
> 1.2 Objetivos 6
>
> 1.3 Planificación de la Solución 7

**2. Modelo de Seguridad** 8

> 2.1 Planteamiento del Proyecto de Seguridad 8
>
> 2.2 Viabilidad Técnica y Operativa de la Solución 9
>
> 2.3 Contexto Técnico del Área donde se Aplicará el Modelo 10
>
> 2.3.1 Hardware 11
>
> 2.3.2 Software 12
>
> 2.3.3 Metodología y Estándares 13
>
> 2.4 Otros Recursos y Consideraciones 14
>
> 2.5 Plan de Ejecución 16
>
> 2.6 Clasificación de Vulnerabilidades y Amenazas 17
>
> 2.7 Implementación de Estándares (ISO, NIST) y Buenas Prácticas 19

**Conclusiones y Recomendaciones** 22

**Glosario** 23

**Bibliografía** 25

Introducción

Una farmacia no solo vende productos: también maneja información delicada. En cada venta de FarmaCentro circulan datos personales del cliente, el detalle de las recetas y el historial de compras, que revela padecimientos y tratamientos, además de pagos con tarjeta y el inventario de medicamentos, algunos de ellos controlados. Si esa información se pierde, se altera o se filtra, el daño no es solo económico: se afecta la privacidad de las personas y se puede detener la atención en las sucursales.

Este proyecto de curso propone un modelo de seguridad de sistemas de información para FarmaCentro, una cadena de farmacias con puntos de venta físicos, tienda en línea, programa de fidelización y despacho a domicilio. El modelo se construye sobre la norma ISO/IEC 27001:2022, que permite montar un Sistema de Gestión de Seguridad de la Información (SGSI) certificable y, por lo tanto, auditable, y se complementa con normas para la información de salud, la privacidad y los pagos con tarjeta. Además, retoma el trabajo previo del equipo: la propuesta técnica inicial (Calderón Cinco et al., 2026a), el documento *Selección y Justificación de Métodos de Segundo Factor de Autenticación* (2026) y el triángulo de la ciberresiliencia (Calderón Cinco et al., 2026b).

La primera parte describe el modelo de negocio, la situación actual, los objetivos y la planificación de la solución. La segunda desarrolla el modelo de seguridad: planteamiento, viabilidad, contexto técnico, recursos, plan de ejecución, clasificación de amenazas e implementación de los estándares. El sistema de gestión de FarmaCentro se desarrollará en una etapa posterior del curso; por eso, los requisitos de seguridad definidos aquí servirán como criterios de diseño y de aceptación para ese desarrollo.

1\. Modelo de Negocio

FarmaCentro es una cadena guatemalteca de farmacias de escala pyme que combina sucursales físicas con canales digitales. Su misión es ofrecer productos y servicios de salud accesibles, confiables y oportunos a las familias guatemaltecas, y su visión es ser la cadena con mayor cobertura y mejor experiencia de compra omnicanal del país (Calderón Cinco et al., 2026a).

**Segmento de mercado.** FarmaCentro pertenece al comercio minorista farmacéutico (*retail* de salud) dirigido al consumidor final, es decir, un modelo B2C. Atiende principalmente a familias de zonas urbanas y periurbanas que compran medicamentos con y sin receta, productos de cuidado personal y artículos básicos de salud, y compite por cercanía, disponibilidad y comodidad. La Tabla 1 resume el modelo de negocio.

**Tabla 1**

*Elementos del modelo de negocio de FarmaCentro*

| **Elemento**            | **Descripción**                                                                                                                                              |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Segmento de clientes    | Consumidor final (B2C): familias guatemaltecas, pacientes con tratamientos continuos y adultos mayores.                                                      |
| Propuesta de valor      | Medicamentos accesibles, con disponibilidad inmediata, atención de un farmacéutico y entrega a domicilio.                                                    |
| Canales                 | Sucursales con punto de venta (POS), tienda en línea, aplicación móvil y despacho a domicilio.                                                               |
| Relación con clientes   | Programa de fidelización con tarjeta o aplicación que registra compras y otorga beneficios.                                                                  |
| Recursos y socios clave | Personal farmacéutico, bodega central, plataforma central de inventario y ventas; droguerías, procesador de pagos, proveedor de nube y mensajería.           |
| Organización            | Gerencia General con las áreas de Operaciones, Comercial y Marketing, Tecnología y Cadena de Suministro; sucursales descentralizadas con plataforma central. |

*Nota.* Elaboración propia con base en la propuesta técnica del proyecto (Calderón Cinco et al., 2026a).

La plataforma central es a la vez la mayor fortaleza del negocio y su mayor punto de riesgo: si falla o se ve comprometida, todas las sucursales lo resienten. Para diseñar el modelo de seguridad, lo primero es saber qué se protege; la Tabla 2 resume los activos de información críticos.

**Tabla 2**

*Activos de información críticos de FarmaCentro*

| **Activo**                       | **Qué contiene**                                                         | **Clasificación** | **Propiedad más sensible**    |
|----------------------------------|--------------------------------------------------------------------------|-------------------|-------------------------------|
| Datos de clientes y fidelización | Nombre, teléfono, correo, dirección e historial de compras               | Confidencial      | Confidencialidad              |
| Recetas y dispensación           | Recetas, medicamentos despachados y farmacéutico responsable             | Sensible (salud)  | Confidencialidad e integridad |
| Transacciones de pago            | Datos de tarjeta procesados por la terminal y la pasarela                | Sensible (pagos)  | Confidencialidad              |
| Inventario                       | Existencias, lotes, vencimientos y medicamentos controlados              | Interna           | Integridad y disponibilidad   |
| Sistema de gestión y POS         | Aplicación, base de datos y terminales de venta                          | Interna           | Disponibilidad                |
| Credenciales y bitácoras         | Contraseñas con BCrypt, plantillas biométricas y registro de operaciones | Sensible          | Confidencialidad e integridad |

*Nota.* Se usan cuatro niveles de clasificación: pública, interna, confidencial y sensible.

1.1 Planteamiento del Problema (Situación Actual)

FarmaCentro creció más rápido que su seguridad. Abrió sucursales, lanzó su tienda en línea y su programa de fidelización, pero la tecnología que sostiene todo eso se fue armando por partes, sin un diseño de seguridad común. El diagnóstico inicial encontró los siguientes problemas.

**Accesos y equipos.** En las cajas se usan usuarios genéricos y, en los cambios de turno, los empleados comparten contraseñas. No hay segundo factor de autenticación, así que cuando se anula una venta o se ajusta el inventario no se sabe quién lo hizo. Las computadoras de caja no tienen parches, se usan para navegar en Internet y su antivirus gratuito no tiene una consola donde alguien revise las alertas.

**Red.** Cada sucursal tiene una red plana: la terminal de pagos, la computadora de inventario, las cámaras y el Wi-Fi de clientes comparten el mismo segmento, de modo que un teléfono infectado podría llegar hasta los equipos de pago. Además, hay un solo enlace de Internet: si falla, la sucursal no puede facturar.

**Datos y respaldos.** Las recetas y el historial de compras se guardan junto con los datos comerciales, en la misma base y sin cifrado, y circulan por correo hojas de cálculo con listados de clientes. Los respaldos se hacen a mano en un disco externo que queda en la misma oficina y nunca se ha probado una restauración.

**Monitoreo y gestión.** No hay bitácoras centralizadas, alertas, política de seguridad ni capacitación. Los incidentes se descubren cuando el sistema ya dejó de funcionar, y la empresa no puede demostrar ante un auditor, un banco o un cliente que protege la información.

Estas debilidades exponen a FarmaCentro a un ransomware que paralice las ventas, al robo de datos de tarjetas, a la filtración de información de salud, al fraude interno con medicamentos controlados y a sanciones por incumplir PCI DSS. En síntesis, el problema es que FarmaCentro no cuenta con un modelo de seguridad formal y auditable que proteja los datos de salud y de pago y que garantice la continuidad de sus puntos de venta. La pregunta que guía el proyecto es: *¿qué controles, basados en estándares internacionales, debe implementar FarmaCentro para reducir sus riesgos a un nivel aceptable y demostrarlo mediante una auditoría?*

1.2 Objetivos

Objetivo General

Diseñar un modelo de seguridad de sistemas de información auditable para FarmaCentro, basado en ISO/IEC 27001:2022 y complementado con ISO 27799:2025 y PCI DSS v4.0.1, que proteja los datos de salud y de pago de los clientes, asegure la continuidad de los puntos de venta y sirva de base para el desarrollo del sistema de gestión.

Objetivos Específicos

1.  Identificar y clasificar activos, amenazas y vulnerabilidades con la metodología de ISO/IEC 27005:2022.

2.  Seleccionar controles del Anexo A de ISO/IEC 27001:2022 que cubran la protección, la detección y la respuesta ante incidentes.

3.  Definir los requisitos de seguridad del sistema de gestión: segundo factor de autenticación, control de acceso por roles y bitácora de auditoría.

4.  Elaborar un plan de ejecución con fases, tiempos, costos y responsables para un piloto de tres sucursales.

5.  Definir indicadores y evidencias que permitan auditar el modelo y medir su mejora.

1.3 Planificación de la Solución

La solución se organiza con el ciclo Planificar-Hacer-Verificar-Actuar (PHVA), que es la lógica con la que funciona un SGSI: primero se entiende el riesgo, luego se aplican controles, después se comprueba que funcionan y, por último, se corrige lo necesario antes de extender el modelo. El proyecto es híbrido, de software y hardware, y está pensado a la medida de una pyme: se prefieren servicios en la nube con pago mensual y se arranca con un piloto de tres sucursales antes de escalar. La Tabla 3 resume cada etapa.

**Tabla 3**

*Planificación de la solución según el ciclo PHVA*

| **Etapa**  | **Qué se hace**                                                                                                                       | **Resultado esperado**                                                 |
|------------|---------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| Planificar | Diagnóstico, inventario de activos, análisis de riesgos, alcance, política de seguridad y selección de controles.                     | Registro de riesgos, política aprobada y declaración de aplicabilidad. |
| Hacer      | Segmentación de red, hardening, terminales P2PE, antimalware gestionado, respaldos, desarrollo del sistema de gestión y capacitación. | Controles funcionando en las sucursales piloto.                        |
| Verificar  | Pruebas de seguridad y de restauración, simulacro de incidente, autoevaluación PCI DSS y auditoría interna.                           | Informe de pruebas y de auditoría con hallazgos.                       |
| Actuar     | Corrección de hallazgos, revisión por la dirección y plan de expansión.                                                               | Plan de mejora y decisión de escalamiento.                             |

*Nota.* Elaboración propia.

El sistema de gestión de FarmaCentro (en adelante, *el sistema de gestión*) será una aplicación web: la interfaz se construirá con React y TypeScript, la API con Node.js, Express y TypeScript, organizada en capas de rutas, controladores y modelos, y la base de datos será MongoDB Atlas. Cubrirá ventas de mostrador, inventario, clientes y fidelización, recetas, usuarios y bitácora de auditoría. El documento *Selección y Justificación de Métodos de Segundo Factor de Autenticación* (2026) planteaba una aplicación de escritorio; el prototipo migra a tecnología web, pero conserva los mismos principios de seguridad.

**Alcance del prototipo académico.** El sistema se desarrollará en la siguiente etapa del curso con datos ficticios y será auditado por otro grupo del curso, que actuará como auditor independiente. El prototipo implementa los controles de software del modelo; la tienda en línea, el modo de contingencia del POS y los controles de red y de hardware quedan documentados como diseño para la implementación real. Para cada control, la entrega al grupo auditor indicará si está implementado, simulado o solo documentado.

2\. Modelo de Seguridad

El modelo responde a una pregunta práctica: ¿qué tiene que pasar para que FarmaCentro pueda vender, guardar datos de salud y cobrar con tarjeta sin exponerse a riesgos que no puede asumir?

2.1 Planteamiento del Proyecto de Seguridad

El proyecto consiste en implementar un SGSI conforme a ISO/IEC 27001:2022. Esta norma no indica qué producto comprar; pide que la organización identifique sus riesgos, elija controles para tratarlos, los documente y los revise periódicamente (International Organization for Standardization e International Electrotechnical Commission \[ISO/IEC\], 2022c). Esa forma de trabajar deja evidencias en cada paso, y eso es lo que hace auditable al modelo.

**Alcance y principios.** Para el piloto, el SGSI comprende los procesos de venta en mostrador y en línea, fidelización, dispensación con receta e inventario; las sucursales piloto, la bodega central y los servicios en la nube, y el sistema de gestión que se desarrollará. Quedan fuera los sistemas internos del procesador de pagos y del proveedor de nube, que se controlan por contrato. El modelo protege la confidencialidad de los datos de salud y de pago, la integridad del inventario, los precios y las recetas, y la disponibilidad del punto de venta.

**Pilares.** Los controles se ordenan con el triángulo de la ciberresiliencia definido por el equipo (Calderón Cinco et al., 2026b): la protección reduce la superficie de ataque, la detección acorta el tiempo en que se identifica una amenaza y la respuesta limita el impacto y restablece la operación (Tabla 4).

**Tabla 4**

*Pilares del modelo de seguridad de FarmaCentro*

| **Pilar**  | **Objetivo**                      | **Controles principales**                                                                                                                              |
|------------|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Protección | Evitar que el incidente ocurra    | Hardening y parches, segmentación por VLAN, terminales P2PE, cifrado, segundo factor, control de acceso por roles y capacitación.                      |
| Detección  | Enterarse pronto de que algo pasa | Antimalware con detección y respuesta en el endpoint (EDR) administrado desde una consola, bitácora de auditoría y alertas automáticas.                |
| Respuesta  | Limitar el daño y volver a operar | Procedimiento de incidentes, aislamiento remoto de equipos, respaldo diario cifrado fuera de sitio, enlace de respaldo y modo de contingencia del POS. |

*Nota.* Adaptado de Calderón Cinco et al. (2026b).

**Seguridad desde el diseño.** Como el sistema de gestión todavía no existe, la seguridad se incorpora desde el diseño: contraseñas almacenadas con BCrypt (Provos y Mazières, 1999); validación de entradas con esquemas y saneamiento de filtros para evitar la inyección NoSQL (Open Worldwide Application Security Project \[OWASP\], 2025); segundo factor con huella verificada en el propio dispositivo mediante WebAuthn (World Wide Web Consortium \[W3C\], 2021) como primera opción y código temporal por SMS o correo como alternativa (*Selección y Justificación de Métodos de Segundo Factor de Autenticación*, 2026; Sagastume Álvarez, 2026); sesiones con cookies seguras y HTTPS; roles con mínimo privilegio; bitácora que registre quién hizo qué, cuándo y desde qué equipo, y datos de salud en una colección propia con campos cifrados. Además, el sistema nunca almacenará números de tarjeta: el cobro lo hace la terminal certificada del procesador, lo que reduce el alcance de PCI DSS.

2.2 Viabilidad Técnica y Operativa de la Solución

Viabilidad Técnica

La solución es viable técnicamente porque usa tecnologías maduras, disponibles en Guatemala y que no requieren un centro de datos propio. Las terminales con cifrado punto a punto las provee el procesador de pagos; la segmentación se logra con un firewall de gama pyme y un switch administrable por sucursal; el antimalware gestionado, como Microsoft Defender for Business, se administra desde la nube, y la base de datos se aloja en MongoDB Atlas, cuyo plan gratuito es administrado y cifra los datos en reposo y en tránsito. El desarrollo usa TypeScript, React, Node.js y MongoDB, herramientas gratuitas y ampliamente documentadas, y la huella se valida con WebAuthn, un estándar que los navegadores y Windows Hello ya soportan, sin necesidad de un SDK propietario.

Viabilidad Operativa

El mayor peligro de un control de seguridad es que el personal lo evite porque le estorba. Por eso la fricción es proporcional al riesgo: la verificación biométrica tarda segundos y se exige en operaciones sensibles, como anular ventas, ajustar inventario o despachar medicamentos controlados (*Selección y Justificación de Métodos de Segundo Factor de Autenticación*, 2026). El enlace de respaldo y el modo de contingencia evitan que una falla de Internet detenga la venta, y el piloto permite capacitar al personal por grupos.

Viabilidad Económica

La inversión estimada para el primer año del piloto es de aproximadamente USD 11,200, unos Q86,500 al tipo de cambio de referencia de Q7.70 por dólar (ver Tabla 9). La mayor parte son servicios con pago mensual y equipo de red de gama pyme, sin servidores propios. El sistema de gestión se desarrolla con herramientas de código abierto y no suma licencias. Frente a esa cifra, un solo incidente grave, con ventas detenidas, equipos por reponer, multas de las marcas de tarjeta y clientes perdidos, puede costar más y ser más difícil de revertir. En lo legal, el modelo atiende el requisito obligatorio de PCI DSS y prepara a la empresa para una futura ley de protección de datos.

2.3 Contexto Técnico del Área donde se Aplicará el Modelo

El modelo se aplicará en las sucursales piloto, con sus puntos de venta y su red local; en la bodega central, donde se guardan los medicamentos controlados; en los servicios en la nube que alojan la base de datos, la tienda en línea y las consolas de seguridad, y en el sistema de gestión que desarrollará el equipo.

2.3.1 Hardware

La Tabla 5 detalla el hardware necesario y el requisito de seguridad de cada componente; la Figura 1 muestra cómo se conecta en una sucursal.

**Tabla 5**

*Hardware del modelo de seguridad*

| **Componente**                                | **Uso**                                            | **Requisito de seguridad**                                                                        |
|-----------------------------------------------|----------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Terminal POS certificada                      | Cobro con tarjeta de chip y sin contacto           | Solución de cifrado punto a punto (P2PE) validada.                                                |
| Computadora de caja                           | Uso del sistema de gestión en el navegador         | Windows 11 Pro con hardening, disco cifrado con BitLocker y USB restringido.                      |
| Lector de huella compatible con Windows Hello | Segundo factor en operaciones sensibles (WebAuthn) | Detección de ataques de presentación evaluada según ISO/IEC 30107-3.                              |
| Firewall UTM y switch administrable           | Frontera y segmentación de la red                  | VLAN (IEEE 802.1Q), filtrado entre segmentos, VPN hacia la nube y puertos sin uso deshabilitados. |
| Punto de acceso Wi-Fi                         | Red interna y red para clientes                    | Redes separadas, WPA3 o WPA2-Enterprise en la red interna y aislamiento entre clientes.           |
| Módem 4G/LTE y UPS                            | Continuidad de ventas y energía                    | Conmutación automática de enlace y autonomía para cerrar ventas y apagar equipos.                 |
| Cámaras IP y control de acceso                | Bodega central y medicamentos controlados          | Segmento propio, credenciales de fábrica cambiadas y retención de grabaciones.                    |

*Nota.* Elaboración propia.

**Figura 1**

*Arquitectura de red segmentada propuesta para una sucursal de FarmaCentro*

<img src="media/127da879822f170a1daca65c45bf628d76bbfbc8.png" style="width:5.41667in;height:3.5625in" />

*Nota.* Cada VLAN es un segmento lógico separado; el firewall solo permite el tráfico necesario y la red de clientes no puede comunicarse con la de pagos ni con la de operación. Elaboración propia.

2.3.2 Software

En software se combinan servicios administrados en la nube con el sistema que desarrollará el equipo; la configuración base de los equipos seguirá las guías de CIS Benchmarks (Center for Internet Security \[CIS\], s.f.). La Tabla 6 resume los componentes.

**Tabla 6**

*Software del modelo de seguridad*

| **Software**                                          | **Función**                                                | **Medida de seguridad**                                                                                                                                    |
|-------------------------------------------------------|------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Sistema de gestión web (por desarrollar)              | Ventas, inventario, clientes, recetas, usuarios y bitácora | React y TypeScript; API en Node.js y Express; bcrypt, validación con esquemas, WebAuthn, roles, bitácora y HTTPS.                                          |
| MongoDB Atlas (base de datos administrada)            | Almacenamiento central                                     | Cifrado en reposo y en tránsito (TLS 1.2 o superior), colección separada con campos cifrados para salud y usuarios de base de datos con mínimo privilegio. |
| Tienda en línea (WooCommerce en hosting administrado) | Venta en línea y pedidos a domicilio                       | Pasarela de pagos con tokenización, actualizaciones y límite de intentos de acceso.                                                                        |
| Windows 11 Pro                                        | Equipos de caja y administrativos                          | Configuración base según CIS Benchmarks y parches centralizados.                                                                                           |
| Microsoft Defender for Business                       | Antimalware y EDR                                          | Consola central, alertas automáticas y aislamiento remoto.                                                                                                 |
| Respaldo en la nube                                   | Copias de seguridad                                        | Respaldo diario cifrado fuera de sitio y prueba mensual de restauración.                                                                                   |

*Nota.* Los productos son ejemplos de referencia para una pyme y pueden sustituirse por equivalentes.

2.3.3 Metodología y Estándares

El modelo combina normas de la International Organization for Standardization (ISO) y la International Electrotechnical Commission (IEC) con otros marcos reconocidos. Se eligieron las que mejor encajan con tres rasgos del negocio: maneja datos de salud, cobra con tarjeta y opera como pyme con sucursales (Tabla 7).

**Tabla 7**

*Normas y marcos seleccionados para FarmaCentro*

| **Norma o marco**                                  | **Para qué se usa**                   | **Por qué se adecua a FarmaCentro**                                    |
|----------------------------------------------------|---------------------------------------|------------------------------------------------------------------------|
| ISO/IEC 27001:2022                                 | Requisitos del SGSI (marco principal) | Es certificable y exige evidencias, lo que vuelve auditable el modelo. |
| ISO/IEC 27002:2022                                 | Guía de los controles del Anexo A     | Explica cómo implementar cada control.                                 |
| ISO/IEC 27005:2022                                 | Gestión de riesgos                    | Permite priorizar y justificar cada control.                           |
| ISO 27799:2025                                     | Seguridad de la información de salud  | FarmaCentro maneja recetas e historiales que revelan tratamientos.     |
| ISO/IEC 27701:2025                                 | Gestión de la privacidad              | Guatemala aún no tiene una ley general de datos personales.            |
| ISO/IEC 27035-1:2023 e ISO 22301:2019              | Incidentes y continuidad              | Dan estructura a la respuesta y a la continuidad del POS.              |
| PCI DSS v4.0.1                                     | Seguridad de datos de tarjetas        | Es obligatorio para comercios que aceptan tarjetas.                    |
| NIST SP 800-63B-4, WebAuthn e ISO/IEC 30107-3:2023 | Autenticación y biometría             | Sustentan el diseño del segundo factor.                                |
| OWASP Top 10:2025                                  | Desarrollo seguro                     | Guía la codificación y las pruebas del sistema.                        |

*Nota.* Elaboración propia con base en ISO (2019, 2025), ISO/IEC (2022a, 2022b, 2022c, 2023a, 2023b, 2025), OWASP (2025), PCI Security Standards Council (2024), Temoshok et al. (2025) y W3C (2021).

ISO/IEC 27001:2022 es el eje porque se certifica como sistema de gestión y porque su Anexo A reúne 93 controles en cuatro temas: organizacionales, de personas, físicos y tecnológicos (ISO/IEC, 2022b). ISO 27799:2025, publicada en diciembre de 2025, adapta esos controles a organizaciones de salud (ISO, 2025), e ISO/IEC 27701:2025 pasó a ser una norma independiente de privacidad (ISO/IEC, 2025), útil para ordenar el tratamiento de datos personales aunque la ley local aún no lo exija de forma general.

**Metodologías de trabajo.** El análisis de riesgos aplica ISO/IEC 27005:2022 (ISO/IEC, 2022a) con una matriz de probabilidad e impacto (sección 2.6). El sistema de gestión se construirá con Scrum en ciclos de dos semanas; cada historia de usuario incluirá criterios de seguridad, por ejemplo, *la anulación de una venta exige verificación biométrica y queda en la bitácora*, y ninguna versión se liberará sin revisión de código y pruebas basadas en OWASP Top 10:2025.

2.4 Otros Recursos y Consideraciones

Recurso Humano y Capacitación

La seguridad la sostiene un equipo con responsabilidades claras (Tabla 8). Todo el personal recibirá una inducción al ingresar y un refuerzo breve cada trimestre sobre phishing, credenciales, reporte de incidentes y trato de la información de salud, con simulaciones controladas de phishing para medir el avance.

**Tabla 8**

*Roles y responsabilidades del proyecto*

| **Rol**                                         | **Responsabilidad**                                                                                                    |
|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| Gerencia General                                | Aprueba la política y el presupuesto; participa en la revisión por la dirección.                                       |
| Responsable de seguridad de la información      | Coordina el SGSI, el registro de riesgos y los incidentes; en una pyme puede ser un rol de medio tiempo en Tecnología. |
| Administrador de TI y red                       | Configura VLAN, firewall, parches, antimalware y respaldos.                                                            |
| Equipo de desarrollo (integrantes del proyecto) | Desarrolla el sistema de gestión con los requisitos de seguridad.                                                      |
| Farmacéutico regente y jefes de sucursal        | Aplican los procedimientos, autorizan operaciones sensibles y reportan incidentes.                                     |
| Auditor interno                                 | Verifica el cumplimiento de los controles e informa hallazgos.                                                         |

*Nota.* Elaboración propia.

Consideraciones Legales y con Proveedores

A la fecha, Guatemala no cuenta con una ley general de protección de datos personales; la Ley de Acceso a la Información Pública (Decreto 57-2008) regula de forma parcial el *habeas data* y la información confidencial (Congreso de la República de Guatemala, 2008; DLA Piper, 2026), y hay iniciativas en discusión en el Congreso. Por eso, adoptar ISO/IEC 27701:2025 prepara a FarmaCentro para un cambio normativo. En pagos, PCI DSS v4.0.1 es la versión vigente y su cumplimiento es obligatorio (PCI Security Standards Council, 2024), y la dispensación debe respetar la normativa del Ministerio de Salud Pública y Asistencia Social. Los contratos con el procesador de pagos, el proveedor de nube y la tienda en línea deberán incluir confidencialidad, aviso de incidentes y derecho a pedir evidencias de cumplimiento.

Presupuesto

La propuesta inicial estimaba USD 37,000 (Calderón Cinco et al., 2026a), una cifra alta para una pyme guatemalteca. El presupuesto se ajustó a precios de referencia del mercado local para un piloto de tres sucursales: se usan equipos de gama pyme, servicios con pago mensual y las terminales P2PE en arrendamiento con el procesador de pagos, en lugar de comprarlas. La Tabla 9 muestra el resultado.

**Tabla 9**

*Presupuesto ajustado del piloto (primer año, tres sucursales)*

| **Rubro**                                                                              | **Costo estimado (USD)** |
|----------------------------------------------------------------------------------------|--------------------------|
| Firewall UTM con licencia anual, switch administrable y punto de acceso (3 sucursales) | 2,700                    |
| Enlace 4G de respaldo: módem y plan de datos por un año (3 sucursales)                 | 1,100                    |
| UPS de 1 kVA (3 sucursales)                                                            | 450                      |
| Lectores biométricos de huella (2 por sucursal)                                        | 400                      |
| Cámaras IP y control de acceso para la bodega central                                  | 800                      |
| Arrendamiento anual de 3 terminales POS con P2PE                                       | 540                      |
| Antimalware gestionado para 15 equipos (un año)                                        | 540                      |
| Base de datos administrada y respaldo en la nube (un año)                              | 1,080                    |
| Tienda en línea: hosting administrado, complementos y certificado (un año)             | 800                      |
| Pruebas de seguridad: escaneo de vulnerabilidades y prueba de penetración básica       | 1,500                    |
| Capacitación y simulaciones de phishing                                                | 300                      |
| Imprevistos (10 %)                                                                     | 1,020                    |
| **Total (aproximadamente Q86,500)**                                                    | **11,230**               |

*Nota.* Precios de referencia del mercado guatemalteco que deben confirmarse con cotizaciones locales; tipo de cambio de referencia de Q7.70 por dólar. No incluye el desarrollo del sistema de gestión (a cargo del equipo, con herramientas de código abierto), las licencias de Windows ya existentes ni las horas del personal interno. La autoevaluación PCI DSS la realiza el responsable de seguridad. Cada sucursal adicional suma alrededor de USD 1,800.

2.5 Plan de Ejecución

La ejecución dura unas 22 semanas y se divide en nueve fases; algunas avanzan en paralelo, como el desarrollo del sistema de gestión mientras se asegura la red (Tabla 10). Al cerrar la última fase, la Gerencia decide con base en los indicadores si el modelo se extiende al resto de sucursales, lo que inicia un nuevo ciclo PHVA.

**Tabla 10**

*Plan de ejecución del modelo de seguridad*

| **Fase**                    | **Actividades principales**                                        | **Semanas** | **Responsable**                  | **Evidencia auditable**                 |
|-----------------------------|--------------------------------------------------------------------|-------------|----------------------------------|-----------------------------------------|
| F1. Análisis y diseño       | Activos, riesgos, alcance, política y declaración de aplicabilidad | 1–3         | Responsable de seguridad         | Registro de riesgos y política aprobada |
| F2. Red y hardening         | VLAN, firewall, hardening y parches centralizados                  | 4–7         | Administrador de TI              | Diagrama de red y reglas de firewall    |
| F3. Desarrollo del sistema  | Sprints con autenticación, roles, bitácora y cifrado               | 4–16        | Equipo de desarrollo             | Revisiones de código y pruebas          |
| F4. POS con P2PE            | Instalación de terminales en sucursales piloto                     | 6–10        | Administrador de TI y procesador | Acta e inventario de terminales         |
| F5. Antimalware y respaldos | EDR, alertas y respaldo diario fuera de sitio                      | 8–10        | Administrador de TI              | Reportes de consola y respaldos         |
| F6. Tienda en línea         | Configuración e integración por API                                | 11–15       | Equipo de desarrollo             | Pruebas de integración                  |
| F7. Pruebas                 | Vulnerabilidades, penetración, restauración y simulacro            | 16–18       | Responsable de seguridad         | Informe de pruebas                      |
| F8. Cumplimiento            | Autoevaluación PCI DSS y auditoría interna ISO/IEC 27001           | 18–20       | Auditor interno                  | Informe de auditoría y SAQ              |
| F9. Despliegue y revisión   | Capacitación, puesta en marcha y revisión por la dirección         | 20–22       | Gerencia General                 | Acta de revisión                        |

*Nota.* Elaboración propia.

2.6 Clasificación de Vulnerabilidades y Amenazas

Una *amenaza* es aquello que puede causar daño, como un ransomware o un empleado deshonesto; una *vulnerabilidad* es la debilidad que permite que la amenaza tenga éxito, como un equipo sin parches. El riesgo aparece cuando ambas coinciden sobre un activo valioso. Siguiendo ISO/IEC 27005:2022 (ISO/IEC, 2022a), se relacionó cada activo con sus amenazas y vulnerabilidades, y se estimó la probabilidad (de 1, rara, a 5, casi segura) y el impacto (de 1, muy bajo, a 5, muy alto). El nivel de riesgo es su producto: bajo de 1 a 4, medio de 5 a 9, alto de 10 a 15 y crítico de 16 a 25; los niveles alto y crítico se tratan de forma obligatoria.

Las amenazas se clasificaron por su origen en humanas intencionales, humanas accidentales, técnicas y físicas o ambientales, y según la propiedad que afectan: confidencialidad (C), integridad (I) o disponibilidad (D). La Tabla 11 presenta la clasificación y la valoración antes (inherente) y después (residual) de aplicar los controles.

**Tabla 11**

*Clasificación y valoración de amenazas y vulnerabilidades*

| **ID** | **Amenaza**                                        | **Tipo**                        | **Vulnerabilidad**                                        | **CID** | **Inherente** | **Residual** |
|--------|----------------------------------------------------|---------------------------------|-----------------------------------------------------------|---------|---------------|--------------|
| R01    | Ransomware                                         | Humana intencional              | Equipos sin parches, antivirus sin consola y red plana    | I, D    | 20 Crítico    | 8 Medio      |
| R02    | Phishing y robo de credenciales                    | Humana intencional              | Sin segundo factor ni capacitación                        | C, I    | 20 Crítico    | 6 Medio      |
| R03    | Suplantación entre empleados                       | Humana intencional o accidental | Usuarios genéricos y contraseñas compartidas              | I       | 15 Alto       | 3 Bajo       |
| R04    | Robo de datos de tarjeta                           | Humana intencional              | Terminales sin P2PE y malware en caja                     | C       | 15 Alto       | 4 Bajo       |
| R05    | Filtración de datos de salud                       | Humana intencional              | Datos sin cifrar y mezclados; hojas de cálculo por correo | C       | 15 Alto       | 8 Medio      |
| R06    | Inyección NoSQL, XSS y fallas de la aplicación web | Humana intencional              | Entradas sin validar y filtros sin sanear                 | C, I    | 12 Alto       | 4 Bajo       |
| R07    | Intrusión desde el Wi-Fi de clientes               | Humana intencional              | Red plana sin segmentación                                | C, I, D | 16 Crítico    | 3 Bajo       |
| R08    | Pérdida de datos                                   | Técnica o accidental            | Respaldo manual en sitio y sin pruebas                    | I, D    | 12 Alto       | 3 Bajo       |
| R09    | Caída del enlace de Internet                       | Técnica                         | Enlace único por sucursal                                 | D       | 12 Alto       | 4 Bajo       |
| R10    | Fraude con inventario y medicamentos controlados   | Humana intencional              | Sin trazabilidad ni segregación de funciones              | I       | 12 Alto       | 4 Bajo       |
| R11    | Robo o daño físico de equipos                      | Física                          | Bodega sin control de acceso; discos sin cifrar           | C, D    | 8 Medio       | 3 Bajo       |
| R12    | Corte eléctrico o sismo                            | Física o ambiental              | Sin UPS ni respaldo fuera de sitio                        | D       | 9 Medio       | 4 Bajo       |
| R13    | Error de configuración o borrado                   | Humana accidental               | Sin control de cambios; privilegios excesivos             | I, D    | 9 Medio       | 4 Bajo       |
| R14    | Falla de un proveedor o componente de terceros     | Técnica (cadena de suministro)  | Complementos sin actualizar; contratos sin cláusulas      | C, I, D | 12 Alto       | 6 Medio      |

*Nota.* C = confidencialidad; I = integridad; D = disponibilidad. Los valores son probabilidad × impacto. Los controles que tratan cada riesgo se indican en la Tabla 12. La valoración residual es una estimación que se confirmará en la fase de pruebas.

Antes de los controles, tres riesgos eran críticos, ocho altos y tres medios; después, ninguno queda en nivel alto o crítico: cuatro se mantienen en medio y diez bajan a bajo (Figura 2). Los riesgos medios residuales (ransomware, phishing, filtración de datos de salud y fallas de terceros) se aceptan de forma documentada por la Gerencia y se vigilan con los indicadores de la sección 2.7.

**Figura 2**

*Mapa de calor del riesgo inherente y del riesgo residual*

<img src="media/569329821a7dc3cf15a60e37105634aaa0c7ec36.png" style="width:6.25in;height:3.15625in" />

*Nota.* Cada celda muestra los riesgos según su probabilidad e impacto. Elaboración propia con base en la Tabla 11.

2.7 Implementación de Estándares (ISO, NIST) y Buenas Prácticas

ISO/IEC 27001:2022 tiene dos partes: las cláusulas 4 a 10, que describen el sistema de gestión, y el Anexo A, con los controles. FarmaCentro cumple las cláusulas así: el contexto y el alcance se definen en las secciones 1 y 2.1 (cláusula 4); la Gerencia aprueba la política y nombra al responsable (cláusula 5); los riesgos se evalúan con ISO/IEC 27005 (cláusula 6); los roles, la capacitación y el presupuesto dan soporte (cláusula 7); el plan de ejecución opera los controles (cláusula 8); los indicadores, la auditoría interna y la revisión por la dirección evalúan el desempeño (cláusula 9), y los hallazgos se corrigen en un nuevo ciclo PHVA (cláusula 10) (ISO/IEC, 2022c).

Controles del Anexo A Seleccionados

La Tabla 12 resume la declaración de aplicabilidad: cómo se aplica cada control, qué evidencia revisará un auditor y qué riesgos atiende. La numeración corresponde a ISO/IEC 27002:2022 (ISO/IEC, 2022b).

**Tabla 12**

*Controles seleccionados del Anexo A (declaración de aplicabilidad resumida)*

| **Control**                          | **Cómo se aplica**                                                                                     | **Evidencia auditable**             | **Riesgos** |
|--------------------------------------|--------------------------------------------------------------------------------------------------------|-------------------------------------|-------------|
| 5.1 Políticas                        | Política general, de contraseñas, uso aceptable y respaldo                                             | Documento firmado y revisión anual  | Todos       |
| 5.15, 5.18 Control de acceso         | Roles (cajero, regente, bodeguero, administrador, auditor) con mínimo privilegio y revisión trimestral | Matriz de roles y actas             | R03, R10    |
| 5.17, 8.5 Autenticación segura       | bcrypt, huella con WebAuthn, código alterno y bloqueo por intentos                                     | Configuración y bitácora de accesos | R02, R03    |
| 5.19–5.22 Proveedores                | Cláusulas de seguridad y evidencias de cumplimiento                                                    | Contratos y certificados            | R14         |
| 5.24–5.28 Incidentes                 | Procedimiento basado en ISO/IEC 27035-1                                                                | Registro e informes de incidentes   | R01, R02    |
| 5.29, 5.30 Continuidad TIC           | Modo de contingencia del POS y enlace de respaldo                                                      | Pruebas de continuidad              | R09, R12    |
| 5.34 Privacidad                      | Aviso de privacidad y consentimiento en la fidelización                                                | Formularios de consentimiento       | R05         |
| 6.3 Capacitación                     | Inducción, refuerzo trimestral y simulaciones de phishing                                              | Asistencia y resultados             | R02, R13    |
| 7.1–7.4 Seguridad física             | Control de acceso y cámaras en bodega                                                                  | Registros y grabaciones             | R10, R11    |
| 8.1, 8.7 Equipos y malware           | Cifrado de disco, EDR con alertas y aislamiento remoto                                                 | Reportes de la consola              | R01, R11    |
| 8.8, 8.9 Vulnerabilidades            | Parches mensuales (críticos en 30 días o menos) y configuración CIS                                    | Reportes de parches y escaneos      | R01, R07    |
| 8.13, 8.14 Respaldo                  | Respaldo diario cifrado fuera de sitio y prueba mensual                                                | Registro y actas de prueba          | R08, R09    |
| 8.15, 8.16 Registro                  | Bitácora con usuario, acción, fecha y equipo; conservación de 12 meses                                 | Reportes de bitácora                | R03, R10    |
| 8.20, 8.22 Redes                     | VLAN y reglas de firewall por sucursal                                                                 | Diagrama y reglas                   | R07         |
| 8.24 Criptografía                    | TLS 1.2 o superior, AES-256 en reposo y P2PE                                                           | Configuración y certificados        | R04, R05    |
| 8.25–8.29, 8.32 Desarrollo y cambios | Capas separadas, TypeScript, validación con esquemas, pruebas OWASP y cambios aprobados en Git         | Pruebas y bitácora de cambios       | R06, R13    |

*Nota.* Una declaración de aplicabilidad completa también justifica los controles excluidos. Elaboración propia con base en ISO/IEC (2022b).

Complementos de las Demás Normas

**Salud y privacidad.** Siguiendo ISO 27799:2025, las recetas y el historial se guardan en un esquema cifrado que solo consultan el farmacéutico regente y el personal autorizado, con cada consulta registrada; los reportes comerciales usan datos seudonimizados (ISO, 2025). Según ISO/IEC 27701:2025, el cliente de la fidelización recibe un aviso de privacidad claro, da su consentimiento, se recoge solo lo necesario y puede consultar o corregir sus datos (ISO/IEC, 2025).

**Incidentes y continuidad.** El procedimiento sigue las fases de ISO/IEC 27035-1:2023: planificar y prepararse, detectar y reportar, evaluar y decidir, responder y aprender (ISO/IEC, 2023b). Si la consola alerta de un ransomware en una caja, el equipo se aísla a distancia, la sucursal pasa a contingencia, se restaura desde el respaldo y se documenta la causa. Conforme a ISO 22301:2019, el sistema central debe recuperarse en cuatro horas o menos, con una pérdida de datos no mayor a 24 horas (ISO, 2019).

**Pagos y autenticación.** Con terminales P2PE, la tarjeta viaja cifrada hasta el procesador y nunca pasa en claro por FarmaCentro, lo que reduce el alcance de PCI DSS; aun así se mantienen la autenticación multifactor para accesos administrativos, la revisión de bitácoras y los escaneos de vulnerabilidades (PCI Security Standards Council, 2024). El NIST trata los códigos por SMS como un autenticador de uso restringido (Temoshok et al., 2025); por eso el código queda como alternativa y las operaciones sensibles exigen la huella mediante WebAuthn, que compara el rasgo en el dispositivo y solo envía al servidor una firma (W3C, 2021); los lectores deben contar con detección de ataques de presentación según ISO/IEC 30107-3:2023 (ISO/IEC, 2023a).

Indicadores para la Auditoría

La Tabla 13 define los indicadores que alimentarán la auditoría interna y la revisión por la dirección.

**Tabla 13**

*Indicadores de seguimiento del modelo*

| **Indicador**                                        | **Meta**       | **Frecuencia** |
|------------------------------------------------------|----------------|----------------|
| Equipos con parches críticos aplicados               | 95 % o más     | Mensual        |
| Usuarios con segundo factor en operaciones sensibles | 100 %          | Mensual        |
| Pruebas de restauración exitosas                     | 100 %          | Mensual        |
| Disponibilidad del POS en horario de atención        | 99.5 % o más   | Mensual        |
| Clics en simulaciones de phishing                    | Menos del 10 % | Trimestral     |
| Hallazgos de auditoría cerrados a tiempo             | 90 % o más     | Semestral      |

*Nota.* Metas iniciales para el piloto.

Conclusiones y Recomendaciones

Conclusiones

El principal problema de FarmaCentro no era la falta de una herramienta, sino la falta de un modelo. ISO/IEC 27001:2022 aporta el marco que ordena, mide y revisa los controles, y deja las evidencias que hacen auditable al modelo. La combinación con ISO 27799:2025, ISO/IEC 27701:2025 y PCI DSS v4.0.1 responde a la naturaleza del negocio: datos de salud, datos personales sin una ley general que los proteja y pagos con tarjeta.

El análisis mostró que los riesgos más graves nacen de debilidades básicas y corregibles; con los controles propuestos, ninguno de los 14 riesgos queda en nivel alto o crítico. Además, el ajuste del presupuesto a unos USD 11,200 para el primer año demuestra que un modelo formal es alcanzable para una pyme guatemalteca. Finalmente, que el sistema de gestión aún no exista es una ventaja: la seguridad se construye desde el diseño.

Recomendaciones

1.  Aprobar la política de seguridad y nombrar al responsable del SGSI antes de cualquier compra.

2.  Atender primero los riesgos críticos: segmentar la red, desplegar el antimalware gestionado y activar el segundo factor.

3.  Probar los respaldos cada mes y hacer al menos un simulacro de incidente al año.

4.  Evaluar a mediano plazo reemplazar el código por correo por una aplicación autenticadora o llaves de acceso (*passkeys*).

5.  Confirmar el presupuesto con cotizaciones locales y dar seguimiento a las iniciativas de ley de protección de datos en Guatemala.

Glosario

**Amenaza.** Evento o actor que puede causar daño a un activo de información.

**BCrypt.** Algoritmo que almacena contraseñas de forma irreversible, con sal automática.

**Declaración de aplicabilidad.** Documento del SGSI que indica qué controles del Anexo A se aplican y justifica los excluidos.

**EDR.** Detección y respuesta en el endpoint; vigila los equipos, alerta ante actividad anómala y permite aislarlos a distancia.

**Hardening.** Reducción de la superficie de ataque de un equipo eliminando servicios y configuraciones innecesarias.

**Inyección NoSQL.** Ataque que introduce operadores maliciosos en los filtros que una aplicación envía a una base de datos como MongoDB.

**P2PE.** Cifrado punto a punto; cifra los datos de la tarjeta desde la terminal hasta el procesador de pagos.

**PCI DSS.** Estándar de seguridad de datos de tarjetas de pago, obligatorio para quienes las aceptan.

**Phishing.** Engaño por correo o mensaje que busca robar credenciales o instalar software malicioso.

**Ransomware.** Programa malicioso que cifra la información y exige un pago para liberarla.

**Riesgo residual.** Nivel de riesgo que permanece después de aplicar los controles.

**SGSI.** Sistema de Gestión de Seguridad de la Información, según ISO/IEC 27001.

**VLAN.** Segmento lógico que separa el tráfico de distintos grupos de equipos en la misma red física.

**Vulnerabilidad.** Debilidad de un activo o control que una amenaza puede aprovechar.

**WebAuthn.** Estándar web para autenticarse con llaves criptográficas, que permite usar la huella o el rostro verificados en el propio dispositivo.

Bibliografía

Calderón Cinco, E. D., Salguero Aquino, J. E. y Cabrera Virula, H. D. (2026a). *Propuesta técnica de seguridad informática: Caso FarmaCentro* \[Trabajo de curso no publicado\]. Facultad de Ingeniería en Sistemas de Información, Universidad Mariano Gálvez de Guatemala.

Calderón Cinco, E. D., Salguero Aquino, J. E. y Cabrera Virula, H. D. (2026b). *Triángulo de la ciberresiliencia: FarmaCentro* \[Trabajo de curso no publicado\]. Facultad de Ingeniería en Sistemas de Información, Universidad Mariano Gálvez de Guatemala.

Center for Internet Security. (s.f.). *CIS Benchmarks*. https://www.cisecurity.org/cis-benchmarks

Congreso de la República de Guatemala. (2008). *Ley de Acceso a la Información Pública* (Decreto número 57-2008).

DLA Piper. (2026). *Data protection laws of the world: Guatemala*. https://www.dlapiperdataprotection.com/

International Organization for Standardization. (2019). *Security and resilience — Business continuity management systems — Requirements* (ISO 22301:2019).

International Organization for Standardization. (2025). *Health informatics — Information security controls in health based on ISO/IEC 27002* (ISO 27799:2025). https://www.iso.org/standard/84647.html

International Organization for Standardization e International Electrotechnical Commission. (2022a). *Information security, cybersecurity and privacy protection — Guidance on managing information security risks* (ISO/IEC 27005:2022).

International Organization for Standardization e International Electrotechnical Commission. (2022b). *Information security, cybersecurity and privacy protection — Information security controls* (ISO/IEC 27002:2022).

International Organization for Standardization e International Electrotechnical Commission. (2022c). *Information security, cybersecurity and privacy protection — Information security management systems — Requirements* (ISO/IEC 27001:2022).

International Organization for Standardization e International Electrotechnical Commission. (2023a). *Information technology — Biometric presentation attack detection — Part 3: Testing and reporting* (ISO/IEC 30107-3:2023).

International Organization for Standardization e International Electrotechnical Commission. (2023b). *Information technology — Information security incident management — Part 1: Principles and process* (ISO/IEC 27035-1:2023).

International Organization for Standardization e International Electrotechnical Commission. (2025). *Information security, cybersecurity and privacy protection — Privacy information management systems — Requirements and guidance* (ISO/IEC 27701:2025).

Open Worldwide Application Security Project. (2025). *OWASP Top 10:2025*. https://owasp.org/Top10/2025/

PCI Security Standards Council. (2024). *Payment Card Industry Data Security Standard: Requirements and testing procedures* (versión 4.0.1). https://www.pcisecuritystandards.org/

Provos, N. y Mazières, D. (1999). A future-adaptable password scheme. En *Proceedings of the 1999 USENIX Annual Technical Conference* (pp. 81–91). USENIX Association.

Sagastume Álvarez, O. E. (2026). *La arquitectura de la confianza: Diseño e implementación de sistemas de autenticación modernos* \[Material del curso Seguridad y Auditoría de Sistemas\]. Universidad Mariano Gálvez de Guatemala.

*Selección y Justificación de Métodos de Segundo Factor de Autenticación: FarmaCentro*. (2026). \[Trabajo de curso no publicado\]. Facultad de Ingeniería en Sistemas de Información, Universidad Mariano Gálvez de Guatemala.

Temoshok, D., Choong, Y.-Y., Regenscheid, A., Galluzzo, R., Fenton, J. L., Richer, J. P. y Lefkovitz, N. B. (2025). *Digital identity guidelines: Authentication and authenticator management* (NIST Special Publication 800-63B-4). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-63B-4

World Wide Web Consortium. (2021). *Web Authentication: An API for accessing public key credentials — Level 2* (W3C Recommendation). https://www.w3.org/TR/webauthn-2/
