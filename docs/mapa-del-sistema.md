# Mapa del sistema

Dónde vive cada cosa y qué archivos se tocan juntos. Se lee **antes** de un cambio que cruza
partes del sistema y se actualiza **en el mismo commit** que lo cambia (si no, deja de servir).
Las rutas son desde la raíz del repositorio.

## 1. Las cuatro partes

| Parte | Dónde | Qué es |
|---|---|---|
| Panel | `admin/` | Lo que usan el equipo y los socios. Lee y escribe Firestore con el SDK (`admin/js/firebase.js`). |
| Sitio público | `scripts/` genera `dist/`; `js/` y `css/` corren en el navegador del visitante | HTML estático. Solo lo público de Firestore, por REST. |
| Funciones | `netlify/functions/` y `netlify/lib/` | Correos, IA, disponibilidad, Search Console. Leen Firestore con la cuenta de servicio (solo lectura). |
| Datos y permisos | `firestore.rules`, `storage.rules` | Se publican **a mano** en la consola de Firebase. Unir código y publicar reglas van juntos. |

## 2. Panel (`admin/`)

- `admin/js/app.js`: sesión, permisos y menú (`ROUTES`: cada sección, su ícono y quién la ve).
- `admin/js/views/*.js`: una pantalla por archivo.
  - Inventario: `properties.js`, `importar.js`, `listado.js` (PDF), `difusion.js`.
  - Clientes: `leads.js`, `clientes.js`, `agenda.js`, `propietarios.js` (propietario, socio o colaborador).
  - Renta vacacional: `solicitudes.js` (solicitudes y chat), `rentas.js` (reservas y estado de cuenta), `mis-casas.js` (pantalla del socio).
  - Herramientas: `calculadora.js`, `cotizacion.js`, `ia.js`, `google.js`, `reportes.js`.
  - Sitio web: `content.js` (textos, colores, zonas), `pages.js`, `blog.js`, `agents.js`, `testimonials.js`, `publish.js`, `users.js`, `dashboard.js`.
- Piezas que usan todas las pantallas (cambiar aquí cambia todo el panel):
  - `form.js`: formularios desde un esquema (tipos de campo, `when`, `required`). Tipo `telefono` = código + número.
  - `ui.js`: `h`, `modal`, `toast`, `badge`, `iconoBtn`, `cajaTabla`, `emptyState`.
  - `tablas.js` + `admin/admin.css`: tablas que pasan a fichas bajo 1200 px.
  - `session.js`: usuario, rol (`isAdmin`, `esSocio`, `agentId`), `markPending`.
  - `crm.js`: cargas que respetan el rol (`loadPropietarios`, `loadPropiedades`, `loadReservas`).
  - `formato.js`: dinero, m², teléfonos, WhatsApp. **También lo usan el generador y las funciones.**
  - `estados.js`: estados de una propiedad y qué pasa en el sitio con cada uno.
  - `pendientes-reglas.js` + `pendientes.js`: «Faltan» (datos por completar).
  - `seo-auto.js`, `seo.js`, `reglas.js` (sin IA) e `ia.js` (con IA; tareas en `netlify/lib/tareas.mjs`).

## 3. Sitio público

- `scripts/build.mjs`: lee los datos, decide qué páginas existen (listados, zonas, destinos, fichas, `/reserva/`, sitemap, feeds, `llms.txt`).
- `scripts/lib/templates.mjs`: el HTML de cada página (`layout`, `listingPage`, `propertyPage`, `leadForm`, `reservaBox`, `reservaPage`…).
- `scripts/lib/i18n.mjs`: **todos** los textos, en español e inglés, y las rutas de cada idioma.
- `scripts/lib/assets.mjs`: empaqueta CSS y JS y quita el CSS sin uso (las clases que solo crea JavaScript van en `SAFELIST`).
- En el navegador:
  - `js/site.js`: formularios (guarda el lead), filtros, seguimiento.
  - `js/calc-vacacional.js`: fórmulas de la renta por noche y filtro de contacto del chat. **Lo usan el sitio, el panel y las funciones.**
  - `js/vacacional.js`: calendario y desglose de la ficha por noche.
  - `js/reserva-chat.js`: página «Tu reserva» y su chat.
  - `js/calc-renta.js` + `js/calc-renta-ui.js`: calculadora de inversión.
- CSS: colores solo en `css/tema.css`; lo del sitio en `css/site.css`; botones en `css/botones.css`.

## 4. Funciones (`netlify/functions/`)

| Función | Cuándo corre | Qué hace |
|---|---|---|
| `aviso-lead.mjs` | Al enviar un formulario | Correo al equipo y al asesor. |
| `aviso-chat.mjs` | Al reservar y al escribir en el chat | Correo al socio o al cliente; lo decide `netlify/lib/avisos-chat.mjs`. |
| `disponibilidad.mjs` | Al abrir una ficha por noche | Noches ocupadas, precios al día, pausa por mora. |
| `solicitudes-sin-respuesta.mjs` | Cada hora | Al equipo: lo que el socio no respondió y las cancelaciones. A las 7 a. m., comisiones del día a cada socio. |
| `comisiones-vencidas.mjs` | Cada hora | Vuelve a publicar si cambió qué socios están en mora. |
| `resumen-diario.mjs` | Cada mañana | Resumen por asesor. |
| `ia.mjs`, `gsc.mjs`, `resenas-google.mjs`, `automatizaciones.mjs`, `deploy-succeeded.mjs` | Desde el panel o al publicar | IA, Search Console, reseñas, pruebas de automatización. |

Compartido: `netlify/lib/correo.mjs` (envío y plantilla), `firestore.mjs` (lecturas), `auth.mjs`, `comisiones.mjs`.

## 5. Datos (Firestore)

| Colección | Qué guarda | Anidado |
|---|---|---|
| `properties/{id}` | La propiedad (público si `publicado`). `propietarioId` = su dueño, socio o colaborador. | `privado/socio` (precio del socio, margen, iCal), `bitacora/` |
| `propietarios/{id}` | Dueños, socios (`tipo: socio`, `datosPago`, `email`) y colaboradores (`tipo: colaborador`, `empresa`). Lista `propiedades`. | — |
| `leads/{id}` | Lo que llega de los formularios. En una reserva: `reserva{}` y `solicitud{}`. **El socio no lo lee.** | — |
| `chats/{token}` | Una reserva vista por el cliente: resumen, `estado`, vistos. El id es la llave del enlace. | `mensajes/` (`de`, `texto`, `tipo`: pago, llegada, foto) |
| `reservas/{id}` | Reserva confirmada y su comisión. Sin teléfono del cliente. | — |
| `clientes`, `actividades`, `requerimientos`, `cotizaciones`, `emisoresAsesor` | CRM y cotizaciones. | — |
| `agents`, `testimonials`, `pages`, `posts` | Contenido del sitio. | — |
| `portalPropietarios/{token}`, `comentariosPropietarios` | Portal del propietario. | — |
| `users/{uid}` | Rol (`admin`, `asesor`, `socio`), `agentId`, `propietarioId`. | — |
| `settings/site`, `settings/private`, `settings/crm`, `settings/cotizacion`, `meta/publish` | Configuración y aviso de cambios sin publicar. | — |

Storage: fotos por dirección; `chats/{token}/…` = comprobantes del cliente.

## 6. Cadenas: qué se toca junto

Cada cadena va en el orden en que conviene revisarla.

**Teléfono** → `admin/js/formato.js` (formato y validación) → `admin/js/form.js` (campo `telefono`) → `scripts/lib/templates.mjs` `leadForm` → `js/site.js` (arma y valida) → `scripts/test-telefono.mjs`.

**Un texto del sitio** → `scripts/lib/i18n.mjs` (español **e** inglés). Si lo usa JavaScript de la ficha por noche o del chat, la clave debe empezar con `vac` (así viaja a la página).

**Un campo nuevo de la propiedad** → `admin/js/views/properties.js` (`schema` y guardado) → `admin/js/pendientes-reglas.js` si es obligatorio → `scripts/lib/templates.mjs` si se muestra → `admin/js/seo-auto.js` y JSON-LD si importa a Google → `admin/js/views/importar.js` y `docs/formato-inventario-propiedades.md` si entra por CSV → `firestore.rules` solo si lo escribe alguien que no es del equipo.

**Dueño del inmueble (propietario, socio, colaborador)** → `admin/js/views/propietarios.js` (`tipo`, lista de casas, `vincularCasas`) ↔ `admin/js/views/properties.js` (`propietarioId`, enlace en ambos sentidos) → `admin/js/views/users.js` (usuario socio) → `firestore.rules` (`esSocioDe`) → `scripts/build.mjs` (mora: solo casas por noche).

**Precio de la renta por noche** → `js/calc-vacacional.js` (única fórmula) → `admin/js/views/properties.js` y `mis-casas.js` (precio del socio → precio público) → `js/vacacional.js` (desglose) → `netlify/functions/disponibilidad.mjs` (precio al día) → `scripts/test-vacacional.mjs`.

**Reserva por noche, de punta a punta** → `scripts/lib/templates.mjs` `reservaBox` → `js/vacacional.js` (fechas, código) → `js/site.js` (guarda el lead) → `js/reserva-chat.js` (`crear` el chat, página «Tu reserva») → `netlify/functions/aviso-chat.mjs` + `netlify/lib/avisos-chat.mjs` → `admin/js/views/solicitudes.js` (chat, Confirmada, Pago recibido, Cancelar) → `admin/js/views/rentas.js` (reserva y comisión) → `netlify/functions/solicitudes-sin-respuesta.mjs` → `firestore.rules` (`leads`, `chats`, `mensajes`, `reservas`) y `storage.rules` (`chats/`).

**Reglas de ingreso de la reserva** (no aflojar): filtro de contacto en `js/calc-vacacional.js` y su piso en `firestore.rules`; datos de pago solo al confirmar; dirección solo con pago recibido; el socio no lee `leads` ni cancela con el pago recibido. Pruebas: emulador de Firestore.

**Estado de una propiedad** → `admin/js/estados.js` → `scripts/build.mjs` (`seOfrece`, páginas cerradas) → `scripts/lib/templates.mjs`.

**«Faltan»** → `admin/js/pendientes-reglas.js` → `scripts/test-pendientes.mjs`.

**Traducción al inglés** → `netlify/lib/tareas.mjs` (con IA) y `admin/js/reglas.js` (sin IA) → `admin/js/views/properties.js` `traducirEn`, `fuenteEs` → `scripts/build.mjs` `propiedadEn`.

**Página nueva del sitio** → `scripts/lib/templates.mjs` → `scripts/build.mjs` (escribirla, sitemap, hreflang) → `scripts/lib/i18n.mjs` (rutas y textos) → `scripts/lib/assets.mjs` si lleva JavaScript propio.

**Sección nueva del panel** → `admin/js/views/<nombre>.js` → `admin/js/app.js` (`ROUTES`) → `firestore.rules` si usa una colección nueva.

## 7. Cómo se prueba

- Todo junto: `npm test` (sintaxis de todo el código y `scripts/test-*.mjs`). En GitHub corre solo en cada pull request.
- Reglas de Firestore: `npm run test:reglas` (`scripts/emulador/`: levanta el emulador limpio y corre los casos).
- Qué revisar antes de unir: `docs/revision-antes-de-unir.md`.
- Sitio: `npm run build` y `npm run serve` (sirve `dist/`).
- Dentro de un lote las reglas ven el estado anterior: lo que depende de un cambio previo va en dos pasos.
- Panel: datos inventados; nunca la base real.
- No se puede probar en local: envío real de correos, Storage, funciones programadas.
