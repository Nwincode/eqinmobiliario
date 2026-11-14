# Panel del dueño (propietarios y colaboradores)

Cada persona de **Propietarios** (dueño del inmueble o asesor colaborador) entra al **mismo panel** que el equipo
(`/admin/`), con su correo y su propia contraseña, y ve solo lo suyo en **Mis propiedades**. Antes había un portal
aparte, sin contraseña (`/propietarios/#t=…` o enlace al correo): ya no existe.

## Cómo entra

1. En su ficha (Propietarios → la persona), el administrador toca **«Dar acceso»**. Usa el correo de la ficha; si
   está vacío, el panel lo pide ahí mismo.
2. Se crea su cuenta con una contraseña al azar que nadie ve, su usuario (`users/{uid}`: `rol: 'socio'`,
   `propietarioId`) y Firebase le manda un correo para **poner su contraseña**.
3. Entra en `/admin/` con su correo y esa contraseña. «¿Olvidaste tu contraseña?» funciona igual que para el equipo.

En la misma ficha: «Reenviar correo para poner contraseña», «Quitar acceso» / «Devolver acceso». Si el correo de la
ficha ya no es el de entrada, la ficha lo avisa (para cambiarlo: quitar el acceso y darlo de nuevo). En Usuarios se
listan como «Propietario» o «Colaborador», con enlace a su ficha; ahí no se crean.

Si el correo ya tiene una cuenta sin acceso al panel (p. ej. de cuando entraba al portal con su correo), el panel no
la puede reutilizar: hay que borrarla en Firebase → Authentication → Usuarios y volver a tocar «Dar acceso».

La página `/propietarios/` (y `/en/owners/`) queda para los enlaces viejos de WhatsApp: dice que el portal ahora es
el panel, con el botón para entrar y el WhatsApp para pedir el acceso. No se indexa.

## Qué ve

- **Mis propiedades:** todas sus casas (venta, renta y por noche), con la misma ficha corta del panel.
- **Casa por noche:** la atiende él: precios, personas, días bloqueados, mínimos de noches, y cuántas reservas
  confirmadas y cuánto le toca. Con casas por noche también ve **Solicitudes** y sus datos de pago.
- **Casa en venta o renta (solo lectura):** estado, precio e historial, días en el mercado, la exclusiva de **esa**
  casa, consultas, visitas y ofertas, lo que pasó, dónde se anuncia, los clientes como «Cliente 1, 2…» (sin nombres,
  teléfonos ni correos) y **«Cómo se anuncia»**, con «Estoy de acuerdo» o «Quiero cambios». Su respuesta le llega al
  asesor en la ficha de la persona.

Nunca ve: su ficha interna (notas, bitácora privada), el acuerdo (comisión, impuestos), leads ni clientes, ni nada
de otra persona. Lo protegen las reglas, no solo la pantalla.

## De dónde salen los datos

`portalPropietarios/{id}`: un resumen por persona que arma el equipo (`admin/js/portal.js`). Lleva su nombre, tipo,
correo, teléfono y datos de pago (tal cual la ficha: las reglas comparan el mensaje de pago del chat con ella) y, de
cada casa en venta o renta, lo de arriba. Las casas por noche no van ahí: se leen en vivo. Se actualiza al guardar la
ficha, al cambiar una propiedad, una visita o la etapa de un cliente, y al abrir Propietarios se arma el de quien
entra al panel y todavía no lo tiene.

En la ficha (`propietarios/{id}`, solo el equipo): `bitacora`, `proximoPaso`, `portalToken` (id del resumen),
`portalPrivado` (números fijos de cada cliente), `acceso { email, activo }` (copia del estado para el asesor).

`comentariosPropietarios`: la respuesta al anuncio. Solo la crea el dueño con sesión, de su propio resumen y de una
casa suya; la lee el equipo.

## Reglas

- `portalPropietarios`: lo lee la persona (rol socio, su `propietarioId`) y el equipo (el asesor, los suyos). Nadie
  sin sesión. Lo escribe solo el equipo.
- `propietarios`: solo el equipo.
- `properties`: el dueño lista y lee las suyas; cambia precios y calendario **solo** de las por noche. `privado/socio`
  y `privado/llegada`, solo de las por noche; `privado/acuerdo`, nunca.

- Reservas, respuestas a solicitudes y mensajes del chat: el dueño solo en sus casas por noche.

## Después de publicar el código: en este orden

Una sola lista para todo lo que cambió en reglas y datos (panel único, reservas, permisos por rol). Mientras no se
publiquen las reglas nuevas, todo lo de antes sigue funcionando; el orden evita rechazos en el medio.

0. **Revisar en Netlify** que estén `GOOGLE_SA_EMAIL` y `GOOGLE_SA_KEY` (la cuenta de servicio con el rol «Cloud
   Datastore Viewer»). Sin ellas no salen los avisos de solicitudes y del chat ni el control de cada hora.
1. **Se publica el código** (Netlify). El sitio se publica **antes** que las reglas: las reglas nuevas revisan la cotización de
   cada solicitud (subtotal, impuestos del 22 %, total y noches = las de las fechas) y el subtotal del chat; una página
   publicada antes, con otro formato, dejaría de guardar solicitudes.
2. **El administrador abre Propiedades**: a las casas por noche se les quita el asesor y pasan a privado su dirección y
   su mapa. Después, **Publicar** el sitio y esperar a que termine (así las páginas ya no mandan el asesor viejo en
   las solicitudes: con las reglas nuevas esas solicitudes se rechazarían).
3. **El administrador abre Rentas vacacionales**: el teléfono y las notas de las reservas de antes pasan a lo privado
   de la casa, y cada reserva recibe su dueño.
4. **El administrador abre Propietarios y la deja abierta hasta que el aviso llegue a 0** (rehace el resumen de cada
   persona con un id nuevo; los enlaces viejos de WhatsApp dejan de abrir). Si alguien falla, «Reintentar».
5. **Se publican las reglas de la base y de archivos, las dos juntas** (en la consola de Firebase: Firestore → Reglas
   y Storage → Reglas, pegando cada archivo completo; o con
   `firebase deploy --only firestore:rules,storage --project eqinmobiliariobd`).
6. **El administrador abre Solicitudes**: las solicitudes de antes reciben el índice de su chat. Si el aviso nombra
   una solicitud con más de un chat, revisarla a mano. Sin este paso, el socio no puede confirmar ni cancelar esas
   solicitudes (el administrador sí).
7. **Dar acceso** desde su ficha a cada dueño de venta o renta y a cada colaborador (el botón se habilita solo). Los
   socios que ya entraban no necesitan nada. Probar primero con un correo propio que el correo para poner la
   contraseña llega (y no cae en spam).
8. **Prueba de punta a punta** con un socio y una casa de prueba: pedir una reserva, confirmarla, subir el
   comprobante, revisar que llegan los correos. Después, borrar la casa y el socio de prueba.

Pruebas: `npm run test:reglas` (dueña con una casa en venta y otra por noche, colaborador, acceso quitado) y el
recorrido del entorno (`npm run recorrido`, paso 8).
