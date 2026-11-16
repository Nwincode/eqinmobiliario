# Formularios: lo básico que todos traen

Lista que se revisa en cada formulario nuevo o cambiado, en el panel y en el sitio. Si algo de aquí falta, se agrega
antes de unir.

## Todos los campos
- Etiqueta visible (`<label for>`), nunca solo el texto gris de ejemplo.
- Tipo correcto para que el celular abra el teclado que toca: `email`, `tel`, `number`/`inputmode="decimal"`, `date`.
- `autocomplete` con su valor (`name`, `email`, `tel`, `username`, `current-password`, `new-password`, `off` solo
  si de verdad no se debe llenar solo).
- Lo que ya está guardado no se vuelve a pedir: se rellena o se sugiere.
- Se revisa mientras se escribe o al salir del campo, no solo al guardar; el mensaje dice qué falta y cómo
  arreglarlo, junto al campo.
- Cada dato con su formato único (`admin/js/formato.js`): teléfono «+código número» (`telefonoValido`: 8 dígitos después del +502), correo (`correoValido`, y `sugerenciaCorreo` para «¿Quisiste decir …@gmail.com?»), fecha, monto.
- Montos con `min` y `max`; un precio de más de 5 veces el de siempre se pregunta antes de guardar.
- Al guardar, todos los errores juntos: cada campo en rojo con su mensaje debajo y la página va al primero.
- Se piensa en alguien de otro país o de otro caso (otro código de país, nombres con acento, montos en dólares).
- El botón de guardar se desactiva mientras guarda y dice qué pasó al terminar (toast o mensaje).
- Enter envía el formulario; un error no borra lo que ya se escribió.

## Contraseñas (`admin/js/clave.js`)
- Ojito para verla, aviso de Bloq Mayús, se puede pegar.
- Contraseña nueva: dos campos, lista que se marca ✓ mientras se escribe (10 caracteres o más, no fácil, sin el correo, con un símbolo de los que cuenta Firebase,
  las dos iguales) y revisión contra filtraciones conocidas.
- Campo oculto con el correo (`autocomplete="username"`) para que el administrador de contraseñas la guarde bien.
- Mensajes que no delatan si una cuenta existe.

## Seguridad
- Todo lo que llega del navegador se vuelve a validar en el servidor o en las reglas.
- Nada de datos de clientes en la dirección (URL) ni en los registros.
