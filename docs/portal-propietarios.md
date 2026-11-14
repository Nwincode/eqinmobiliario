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

1. **Se publica el código** (Netlify). Con las reglas de antes todo sigue funcionando: el socio confirma reservas
   (sus datos de pago salen de su ficha mientras las reglas viejas lo permiten). Propietarios muestra un aviso con
   estos pasos, y «Dar acceso» queda deshabilitado para quien no tiene casas por noche (con las reglas de antes podría
   leer su ficha entera y cambiar el precio de su casa en venta). Los enlaces viejos del portal todavía abren.
2. **El administrador abre Propietarios una vez** y espera unos segundos: se rehace el resumen de cada socio y de cada
   portal de antes, **con un id nuevo**; el anterior se borra, así que los enlaces viejos de WhatsApp dejan de abrir
   aquí (muestran la página «Tu portal ahora es tu panel»). Sin este paso, después del 3 un socio sin resumen no
   puede confirmar reservas (el panel le dice que faltan sus datos de pago).
3. **Se publican las reglas:** `firebase deploy --only firestore:rules --project eqinmobiliariobd`. El aviso de
   Propietarios desaparece solo; el socio ya lee su resumen y no su ficha.
4. **Dar acceso** a cada dueño de venta o renta y a cada colaborador, desde su ficha: el botón ya está habilitado.
   Los socios que ya entraban no necesitan nada.

Pruebas: `npm run test:reglas` (dueña con una casa en venta y otra por noche, colaborador, acceso quitado) y el
recorrido del entorno (`npm run recorrido`, paso 8).
