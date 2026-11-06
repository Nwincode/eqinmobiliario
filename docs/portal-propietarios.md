# Portal de propietarios

Página privada donde el propietario ve cómo va su propiedad sin tener que llamar.

- Español: `https://eqinmobiliario.gt/propietarios/`
- Inglés: `https://eqinmobiliario.gt/en/owners/` (solo si el inglés está activo)

No aparece en Google: lleva `noindex`, no está en el sitemap y Netlify manda `X-Robots-Tag: noindex, nofollow`.

## Qué ve el propietario

- Estado de la propiedad y días en el mercado.
- **Cómo se anuncia:** título, precio, operación, tipo, ubicación, habitaciones, baños, m² de construcción y de terreno (en inglés, en sq ft), hasta 6 fotos, la descripción del anuncio (respeta saltos de línea, listas «- » y **negritas**; se pinta como texto, sin HTML) y el enlace «Ver anuncio en la página». En `/en/owners/` usa el título, la descripción y la URL en inglés si la propiedad está traducida.
- Debajo, dos botones: **«Estoy de acuerdo con el anuncio»** (guarda la aprobación y muestra «Gracias, tu asesor ya sabe que estás de acuerdo») y **«Quiero cambios»** (abre la caja de comentarios, oculta hasta entonces, con `aria-expanded` y el foco en el texto). El aviso de confirmación o de error se anuncia a lectores de pantalla (`role="status"`).
- Cuántas consultas, visitas y ofertas hubo, en total y en los últimos 30 días. No ve nombres ni teléfonos de clientes.
- Visitas agendadas que vienen.
- Lo que pasó: las entradas de la bitácora marcadas como visibles y los comentarios de visitas marcados como visibles.
- Historial de precio.
- Dónde se anuncia (el sitio y los portales marcados como «publicada» en Difusión).
- Fecha en que vence la exclusiva.
- Próximo paso.
- Botones para escribirle por WhatsApp o llamar a su asesor.

No se muestran las vistas de la página, porque el sitio no las cuenta.

## Cómo entra (sin contraseña)

1. **Enlace privado.** El asesor se lo manda por WhatsApp. Lleva un código de 32 caracteres después de `#t=`. Como va después del `#`, el código no llega a ningún servidor ni queda en registros. Quien tenga el enlace puede ver el portal, así que no se debe reenviar.
2. **Con su correo.** Escribe el correo que tiene registrado y Firebase le manda un enlace para entrar. La página siempre dice «Si tu correo está registrado, te llegó un enlace», para no revelar qué correos existen. Si abre el enlace en otro aparato, la página le pide el correo otra vez.

## Lo que el dueño de la cuenta debe hacer una vez

1. **Firebase → Authentication → Sign-in method → Correo electrónico/contraseña.** Activarlo y activar también «Vínculo de correo electrónico (acceso sin contraseña)». No hace falta que nadie use contraseña.
2. **Authentication → Settings → Dominios autorizados.** Deben estar `eqinmobiliario.gt` y `www.eqinmobiliario.gt`.
3. **Publicar las reglas** (proyecto `eqinmobiliariobd`), desde la carpeta del repositorio:

   ```
   firebase deploy --only firestore:rules --project eqinmobiliariobd
   ```

   Mientras no se publiquen, el panel no puede crear portales y la página muestra «No pudimos abrir tu portal».
4. Publicar el sitio como siempre (Netlify corre `node scripts/build.mjs`).

Opcional: en Authentication → Templates se puede cambiar el texto del correo que llega.

## Cómo lo usa el asesor (Panel → Propietarios → abrir un propietario)

La sección **Portal del propietario** está debajo del formulario.

- **Crear portal:** arma la copia y crea el enlace privado.
- **Enviar por WhatsApp:** abre WhatsApp con un mensaje listo y el enlace.
- **Copiar enlace** y **Ver como propietario:** para revisarlo o mandarlo por otro medio.
- **Actualizar portal:** vuelve a armar la copia con los datos de hoy. También se actualiza solo al guardar el propietario, la bitácora, el próximo paso o un comentario de visita. Al cambiar la propiedad (precio, estado, fotos), pulsa «Actualizar portal» o guarda el propietario.
- **Regenerar enlace:** crea un enlace nuevo y borra el anterior, que deja de funcionar. Úsalo si el enlace llegó a otra persona.
- **Quitar acceso:** borra la copia. El propietario ya no puede entrar, ni con el enlace ni con su correo.
- **Próximo paso:** una frase corta que el propietario ve arriba.
- **Bitácora del asesor:** fecha, tipo (fotos nuevas, cambio de precio, oferta, visita, paso, nota) y qué pasó. Solo se publican las entradas con «Visible para el propietario». Las demás quedan como notas internas.
- **Respuesta del propietario al anuncio:** lista lo que llegó desde el portal, lo más nuevo arriba: «Aprobó el anuncio» con su fecha, o «Pidió cambios» con la fecha y el texto.
- **Comentarios de visitas:** salen de la agenda (actividades tipo «Visita» del cliente). Se escribe un comentario para el propietario y se marca como visible. No escribas nombres de clientes.

Para entrar con su correo, el propietario necesita tener el campo **Correo** lleno en su ficha.

## Modelo de datos

`propietarios/{id}` (privado, solo el equipo):

- `email`
- `proximoPaso`
- `bitacora[]` con `{ id, fecha, tipo, texto, propertyId, visible }`
- `portalToken`
- `portalActualizado`

`actividades/{id}`, solo en las de tipo visita:

- `comentarioPropietario`
- `visiblePropietario`

`properties/{id}`:

- `historialPrecio[]` con `{ precio, moneda, fecha }`. Se agrega una entrada cada vez que el precio cambia al guardar.

`portalPropietarios/{token}` es la copia resumida que lee la página. No tiene nombres ni teléfonos de clientes:

```
v, email (en minúsculas), agentId, propietarioId, nombre (solo el primero),
asesor { nombre, whatsapp, telefono, foto },
exclusivaFin, proximoPaso, updatedAt,
propiedades[] {
  id, titulo, foto, url, operacion,
  anuncio { tipo, zona, ciudad, habitaciones, banos, m2Construccion, m2Terreno,
            descripcion, fotos[] (hasta 6), en { titulo, descripcion, url } | null }, estado, estadoFecha,
  enMercadoDesde, enMercadoHasta, precio, moneda, historialPrecio[],
  kpis { consultas{total,d30}, visitas{…}, ofertas{…}, visitasProximas },
  eventos[] { fecha, tipo, texto },
  portales[] { nombre, url, desde }
}
```

`comentariosPropietarios/{id}` (respuesta del propietario; fuera del portal para que no se pierda al regenerar el enlace):

```
token, propietarioId, agentId, propiedadId,
tipo ('aprobado' | 'cambios'), texto ('' al aprobar; 1–2000 al pedir cambios),
fecha (hora del servidor), origen: 'propietario', idioma ('es' | 'en')
```

## Reglas (`firestore.rules`)

- Cualquiera puede **leer un portal por su token** (`get`). Sin el token no se puede adivinar: es aleatorio y tiene 32 caracteres o más.
- **Listar** solo se permite al propietario con correo verificado, y solo para sus propios portales (`email == su correo`). El equipo puede listar: el administrador todos, el asesor solo los suyos.
- **Crear, cambiar y borrar** solo lo puede hacer el equipo: el administrador cualquiera, el asesor solo los de sus propietarios. El asesor no puede pasar un portal a otro asesor. Se rechazan tokens cortos, correos con mayúsculas y datos mal formados.
- En el portal, el propietario no puede escribir nada.
- **Respuestas (`comentariosPropietarios`):** solo se pueden **crear**, y solo si se tiene el token de un portal que existe (el enlace o, con el correo, el id del portal que ya puede listar). `propietarioId` y `agentId` deben coincidir con ese portal; `tipo` es `aprobado` o `cambios`; con `cambios` el texto lleva de 1 a 2000 caracteres; `origen` es `propietario` y la fecha es la del servidor. Nadie las cambia ni las borra desde el sitio. Las lee el administrador o el asesor de ese propietario.

**Importante:** estos cambios de reglas no se publican solos. El dueño de la cuenta debe volver a publicarlas:

```
firebase deploy --only firestore:rules --project eqinmobiliariobd
```

Las reglas del portal se probaron sin conexión con el emulador de Firestore: 32 de 32 casos correctos. La regla de `comentariosPropietarios` todavía no se probó en el emulador.

## Privacidad y límites

- El portal es una copia del momento en que se guardó o se actualizó. No es en vivo.
- Las consultas cuentan solo los leads guardados con esa propiedad. Las ofertas salen de la bitácora (tipo «Oferta») o de clientes en etapa oferta o cierre. Se usa el número que sea mayor.
- Una visita sin propiedad en la agenda solo se cuenta si el cliente tiene una sola propiedad de interés.
- Cualquiera puede pedir el correo con enlace para cualquier dirección. Firebase lo manda, pero sin un portal con ese correo no se ve nada. Firebase limita cuántos correos se mandan por día.
