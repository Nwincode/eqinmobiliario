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

- Reservas, respuestas a solicitudes y mensajes del chat: el dueño solo en sus casas por noche. Confirmar, «No se dio»,
  cancelar y «Pago recibido» del dueño los escribe el servidor (`netlify/functions/reservas.mjs`, con la cuenta de
  escritura): el dueño solo escribe texto en el chat, su «visto», sus precios, días bloqueados y el comprobante de la
  comisión.

## Después de publicar el código: en este orden

Una sola lista para todo lo que cambió en reglas y datos (panel único, reservas, permisos por rol). Mientras no se
publiquen las reglas nuevas, todo lo de antes sigue funcionando; el orden evita rechazos en el medio.

0. **Revisar en Netlify** que estén `GOOGLE_SA_EMAIL` y `GOOGLE_SA_KEY` (la cuenta de servicio con el rol «Cloud
   Datastore Viewer»). Sin ellas no salen los avisos de solicitudes y del chat ni el control de cada hora.
1. **Crear la cuenta de escritura de las reservas** (una sola vez; la de arriba no se toca):
   1. En [Google Cloud](https://console.cloud.google.com/), con el proyecto `eqinmobiliariobd` elegido arriba:
      **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**. Nombre: `reservas-escritura`.
      **Crear y continuar**.
   2. En «Otorga a esta cuenta de servicio acceso al proyecto», rol **Cloud Datastore User** («Usuario de Cloud
      Datastore»). **Continuar → Listo**.
   3. Abrir la cuenta `reservas-escritura` → pestaña **Claves → Agregar clave → Crear clave nueva → JSON → Crear**. Se
      descarga un archivo `.json`.
   4. En Netlify: **Site configuration → Environment variables → Add a variable**, dos variables:
      `GOOGLE_SA_ESCRITURA_EMAIL` = el `client_email` del archivo, y `GOOGLE_SA_ESCRITURA_KEY` = el `private_key`
      completo (desde `-----BEGIN PRIVATE KEY-----` hasta `-----END PRIVATE KEY-----`).
   5. Borrar el archivo `.json` de la computadora. **No se comparte con nadie ni se pega en un chat**: es la llave para
      escribir en toda la base.
2. **Se publica el código** (Netlify; si las variables se agregaron después de la última publicación: **Deploys →
   Trigger deploy**, para que la función las lea). El sitio se publica **antes** que las reglas: las reglas nuevas
   revisan la cotización de cada solicitud (subtotal, impuestos del 22 %, total y noches = las de las fechas) y el
   subtotal del chat; una página publicada antes, con otro formato, dejaría de guardar solicitudes. Mientras falte la
   cuenta de escritura, el panel del dueño sigue como antes (la función responde «sin configurar» y el panel escribe
   como siempre, con las reglas de antes).
3. **El administrador abre Solicitudes** y revisa que arriba diga **«Reservas por servidor: activo»** (la función
   escribe una prueba en la base con la cuenta nueva). Si dice «sin configurar» o «con error», revisar el paso 1 y
   **no seguir al paso 7**: con las reglas nuevas, el dueño ya no puede confirmar ni cancelar sin el servidor.
4. **El administrador abre Propiedades**: a las casas por noche se les quita el asesor y pasan a privado su dirección y
   su mapa. Después, **Publicar** el sitio y esperar a que termine (así las páginas ya no mandan el asesor viejo en
   las solicitudes: con las reglas nuevas esas solicitudes se rechazarían).
5. **El administrador abre Rentas vacacionales**: el teléfono y las notas de las reservas de antes pasan a lo privado
   de la casa, y cada reserva recibe su dueño.
6. **El administrador abre Propietarios y la deja abierta hasta que el aviso llegue a 0** (rehace el resumen de cada
   persona con un id nuevo; los enlaces viejos de WhatsApp dejan de abrir). Si alguien falla, «Reintentar».
7. **Se publican las reglas de la base y de archivos, las dos juntas** (en la consola de Firebase: Firestore → Reglas
   y Storage → Reglas, pegando cada archivo completo; o con
   `firebase deploy --only firestore:rules,storage --project eqinmobiliariobd`). Desde aquí, lo que el dueño confirma,
   cancela o cobra solo lo escribe el servidor.
8. **El administrador abre Solicitudes**: las solicitudes de antes reciben el índice de su chat. Si el aviso nombra
   una solicitud con más de un chat, revisarla a mano. Sin este paso, el socio no puede confirmar ni cancelar esas
   solicitudes (el administrador sí).
9. **Dar acceso** desde su ficha a cada dueño de venta o renta y a cada colaborador (el botón se habilita solo). Los
   socios que ya entraban no necesitan nada. Probar primero con un correo propio que el correo para poner la
   contraseña llega (y no cae en spam).
10. **Prueba de punta a punta** con un socio y una casa de prueba: pedir una reserva, confirmarla, subir el
    comprobante, marcar «Pago recibido», cancelar otra; revisar que llegan los correos (también el del equipo cuando
    el socio cancela). Después, borrar la casa y el socio de prueba.

Pruebas: `npm run test:reglas` (dueña con una casa en venta y otra por noche, colaborador, acceso quitado) y el
recorrido del entorno (`npm run recorrido`, paso 8).
