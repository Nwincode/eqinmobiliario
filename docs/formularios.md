# Formularios: lo básico que todos traen

Lista que se revisa en cada formulario nuevo o cambiado, en el panel y en el sitio. Si algo de aquí falta, se agrega
antes de unir.

## Todos los campos
- Etiqueta visible (`<label for>`), nunca solo el texto gris de ejemplo. Donde no cabe una etiqueta (buscadores,
  filtros, la barra de «Agendar», un campo dentro de un grupo) lleva `aria-label`: el lector de pantalla y el dictado
  del celular necesitan su nombre.
- Tipo correcto para que el celular abra el teclado que toca: `email`, `tel`, `number`/`inputmode="decimal"`, `date`.
- `autocomplete` con su valor (`name`, `email`, `tel`, `username`, `current-password`, `new-password`, `off` solo
  si de verdad no se debe llenar solo).
- Datos de OTRA persona (cliente, dueño, huésped, un usuario nuevo): `autocomplete="off"`, para que el navegador no
  ponga el nombre, el correo o el teléfono de quien escribe. Ya lo hacen `campoTelefono` y el correo de `renderForm`
  (`admin/js/form.js`); lo propio (entrar, «Mis datos») sí lleva su valor.
- Números y montos: `inputmode="decimal"` (o `numeric` si son enteros) para que el celular abra el teclado de números.
- Lo que ya está guardado no se vuelve a pedir: se rellena o se sugiere.
- Se revisa mientras se escribe o al salir del campo, no solo al guardar; el mensaje dice qué falta y cómo
  arreglarlo, junto al campo. `renderForm` lo hace solo con el correo, el teléfono (también al cambiar el código de
  país) y los números con mínimo o máximo; un formulario armado a mano usa las mismas piezas (`campoTelefono` con
  `revisar`, `campoCorreo` y `revisarCampos` al guardar, de `admin/js/form.js`).
- Cada dato con su formato único (`admin/js/formato.js`): teléfono «+código número» (`telefonoValido`: 8 dígitos después del +502), correo (`correoValido`, y `sugerenciaCorreo` para «¿Quisiste decir …@gmail.com?»), fecha, monto.
- Montos con `min` y `max`; un precio de más de 5 veces el de siempre se pregunta antes de guardar.
- Al guardar, todos los errores juntos: cada campo en rojo con su mensaje debajo y la página va al primero.
- Se piensa en alguien de otro país o de otro caso (otro código de país, nombres con acento, montos en dólares).
- El botón de guardar se desactiva mientras guarda y dice qué pasó al terminar (toast o mensaje). Pieza común:
  `ocupado(boton, fn)` (`admin/js/ui.js`). Vale también para «Agendar», «Agregar nota», «Eliminar» y cualquier botón
  que cree algo: dos toques no crean dos.
- Los errores se dicen en español y con lo que hay que hacer: `errorMessage` (`admin/js/ui.js`) nunca muestra el
  texto de Firebase («FirebaseError: Missing or insufficient…»), ni «Failed to fetch», ni un código; una función del
  sitio que responde sin explicar usa `fallaDelServidor(status)`, nunca «Error 500» ni «El servidor respondió 500».
- Botón de solo ícono: `iconoBtn` (nombre en `aria-label` y `title`, 44 px de toque).
- Lista vacía: dice qué falta y cómo empezar (`emptyState`, o `vacio` de `tablaAdmin`), nunca una tabla en blanco.
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
