# Equipo Inmobiliario — sitio web y panel de administración

Sitio estático generado a partir de **Firebase** (Firestore + Auth + Storage) y publicado en **Netlify**.
Todo el contenido (textos, portada, propiedades, landing pages VIP, asesores, reseñas, páginas, menú, SEO)
se edita desde el panel en **`/admin/`**.

## Cómo funciona

```
Panel /admin  ──guarda──▶  Firebase (proyecto eqinmobiliariobd)
      │                              │
      └─ botón "Publicar" ─▶ Netlify ejecuta `node scripts/build.mjs`
                                     │  lee Firestore y genera HTML estático en dist/
                                     ▼
                       Sitio público (rápido e indexable por Google)
```

- Los formularios del sitio guardan los **leads** directamente en Firestore.
- Mientras Firebase no esté configurado, el sitio se genera con `data/seed.json` (contenido actual).

## URLs del sitio

| URL | Contenido |
|---|---|
| `/` | Portada |
| `/propiedades/`, `/propiedades/venta/`, `/propiedades/renta/` | Listados con filtros |
| `/propiedad/<slug>/` | Ficha de propiedad |
| `/vip/` y `/vip/<slug>/` | Landing pages de propiedades VIP |
| `/<slug>/` | Páginas de contenido (privacidad, términos…) |
| `/sitemap.xml`, `/robots.txt` | SEO |
| `/admin/` | Panel de administración |

## Puesta en marcha (una sola vez)

1. **Configuración web de Firebase** → copiar `firebaseConfig` (Configuración del proyecto → General → Tus apps → app web) en `site.config.json`.
2. **Authentication** → Comenzar → activar *Correo electrónico/contraseña*.
3. **Firestore Database** → Crear base de datos (modo producción, ubicación `nam5` o la más cercana).
4. **Storage** → Comenzar (requiere el plan Blaze; el uso normal de este sitio queda dentro de la capa gratuita).
5. **Reglas de seguridad** → pegar `firestore.rules` en Firestore → Reglas, y `storage.rules` en Storage → Reglas, y Publicar.
6. Abrir `/admin/` → **Crear primer administrador**.
7. En el panel → **Publicar** → *Importar datos iniciales*.
8. En Netlify → Site configuration → Build & deploy → **Build hooks** → crear uno y pegarlo en el panel (Publicar).

## Roles

- **Administrador**: todo (contenido, propiedades, leads, usuarios, publicación).
- **Asesor**: crea y edita sus propiedades, ve y gestiona sus leads. Debe estar vinculado a un asesor en *Usuarios*.

## Asistente IA

Sección **Asistente IA** del panel (usa Claude, de Anthropic, a través de la función `netlify/functions/ia.mjs` en `/api/ia`):

| Herramienta | Qué hace |
|---|---|
| Buscar para un cliente | Pegas el mensaje del cliente; la IA entiende el pedido, revisa el inventario, explica qué encaja y qué no, y deja listo el WhatsApp con enlaces. Puedes guardar al cliente. |
| Redactar ficha y redes | Escribe descripción, título, SEO, textos de la landing VIP y posts de Instagram/Facebook; se aplican a la propiedad con un clic. |
| Seguimiento de leads | Resume el caso, lo clasifica (caliente/tibio/frío), dice el siguiente paso y redacta WhatsApp y correo. |
| Clientes que buscan | Al captar una propiedad, encuentra entre los clientes guardados a quién ofrecérsela, con un mensaje para cada uno. |
| Asistente | Chat para el día a día: mensajes, objeciones, comparaciones, cálculos y organización. |

En el sitio público, la **búsqueda inteligente** convierte una frase ("casa de 3 habitaciones en zona 16 hasta 300 mil") en filtros. Se activa en *Contenido del sitio → IA y herramientas*.

**Activación:** crea una clave en [console.anthropic.com](https://console.anthropic.com) (requiere método de pago) y agrégala en Netlify →
*Site configuration → Environment variables* como `ANTHROPIC_API_KEY`. Vuelve a publicar. La IA solo funciona para usuarios activos del
panel (verifica el inicio de sesión de Firebase) y nunca inventa propiedades: solo usa el inventario publicado.
Costo orientativo: centavos de dólar por tarea; conviene fijar un límite de gasto mensual en la consola de Anthropic.

## Qué se administra desde el panel

| Sección del panel | Qué controla |
|---|---|
| Propiedades | Fichas, fotos, video, mapa, precio, estado, VIP y su landing, traducción al inglés, SEO de cada ficha |
| Leads | Contactos recibidos, estado, asesor asignado, notas, campaña de origen, exportación |
| Asesores / Reseñas | Equipo con foto y contacto; testimonios (con versión en inglés) |
| Páginas / Blog | Páginas libres (legales, guías) y artículos, en español o inglés |
| Contenido del sitio | General y logos, Google y anuncios, compradores en EE. UU., sitio en inglés, IA y calculadora, SEO de la portada, títulos de listados, portada, secciones, contacto y redes, **zonas** (texto propio de cada página de zona), menú y pie, y **textos del sitio** (cada botón, etiqueta y mensaje en español e inglés, incluidos los mensajes de WhatsApp con `{titulo}`, `{nombre}` y `{url}`) |
| Google | Search Console, oportunidades, inspector de URL y revisión SEO del inventario |
| Usuarios / Publicar | Accesos y roles; publicación del sitio |

Fijo en el código a propósito: colores y tipografía de la marca (ver `docs/marca/`), estructura de las páginas y rutas.

## Clientes, agenda y propietarios (CRM del equipo)

Cada asesor entra con su usuario y ve **solo lo suyo** (lo exigen las reglas de Firestore); el administrador ve todo.

- **Clientes**: una ficha por persona. Los leads del sitio se unen solos a su ficha al abrir la sección
  (por teléfono o correo, aunque el teléfono venga escrito distinto). Tablero por etapas
  (Nuevo → Contactado → Visita → Oferta → Cierre / Perdido) con arrastrar y soltar, lista, búsqueda y exportación.
  La ficha reúne historial (llamadas, WhatsApp, visitas, notas y los mensajes que dejó en el sitio),
  pendientes, propiedades de interés, presupuesto, monto del negocio y comisión.
- **Agenda**: seguimientos, visitas y tareas por fecha (vencidas, hoy, próximos días), con «Hecho»,
  «+1 día» y «+7». El inicio del panel muestra «Para hoy»: vencidos, clientes sin seguimiento y exclusivas por vencer.
- **Propietarios**: contacto, propiedades (con precio mínimo aceptado), exclusiva con fechas, comisión y
  enlace al contrato. Aviso cuando una exclusiva vence en 30 días o menos.
- **Reportes** (administrador): por asesor, leads, leads sin atender, tiempo de primera respuesta, actividades,
  visitas, seguimientos vencidos, negocios en proceso, cierres, monto cerrado y comisión; embudo de clientes.
  Ahí mismo se fija la **regla general de comisión** (`settings/crm`): % en venta, meses de renta en alquiler y
  parte del asesor. Se aplica a todo cliente o propietario sin comisión propia.

Colecciones nuevas: `clientes`, `actividades`, `propietarios` (reglas en `firestore.rules`: vuelve a publicarlas
en Firebase después de actualizar).

## Difusión en portales y redes (sección "Difusión" del panel)

Para no redactar cada anuncio a mano en cada plataforma:

- **Kit por propiedad** (botón "📣 Difundir en portales" en la propiedad): título y texto ya adaptados a cada
  plataforma —Encuentra24, Facebook Marketplace, grupos de Facebook, Instagram, WhatsApp y portales en inglés—,
  respetando su límite de caracteres, con botones para copiar. Las plataformas y sus límites se cambian en
  *Contenido del sitio → Portales*.
- **Fotos en ZIP**: originales en JPG (muchos portales no aceptan WebP), cuadradas 1080×1080, verticales
  1080×1350 e historias 1080×1920, estas tres con el logo de marca de agua.
- **Enlaces con seguimiento**: cada texto lleva el enlace a la ficha con `utm_source=<plataforma>`, así cada lead
  muestra de qué plataforma vino (columna "Fuente" de Leads).
- **Tablero**: dónde está publicada cada propiedad; avisa qué anuncios **actualizar** (la propiedad cambió después
  de publicarla) y cuáles **dar de baja** (vendida, rentada o despublicada).
- **Catálogos automáticos** (se regeneran en cada publicación):
  - `/feeds/meta-inmuebles.xml`: catálogo de inmuebles de Meta (Commerce Manager → Fuentes de datos → Feed
    programado) para anuncios dinámicos en Facebook e Instagram.
  - `/feeds/kyero.xml`: formato Kyero v3, aceptado por varios portales y agregadores internacionales.
  - `/feeds/propiedades.json`: para cualquier integración a la medida.
  Las fotos de los catálogos se sirven en JPG con el CDN de imágenes de Netlify.

Encuentra24, Marketplace e Instagram no ofrecen publicación automática para cuentas comunes; por eso el kit deja
todo listo para copiar y pegar en segundos. Si un portal ofrece carga por XML a tu cuenta de agencia, dale la URL
del catálogo.

## SEO y herramientas de Google

Todo se configura en el panel → *Contenido del sitio → Google y anuncios*:

| Herramienta | Qué poner | Para qué |
|---|---|---|
| **Google Search Console** | Código de la "Etiqueta HTML" (solo el valor de `content`) | Verificar el sitio, enviar `/sitemap.xml` y ver búsquedas |
| **Bing Webmaster** | Código `msvalidate.01` | Lo mismo en Bing |
| **Google Analytics 4** | ID `G-XXXXXXX` | Visitas y conversiones (dejar vacío si GA4 ya está en GTM) |
| **Google Ads** | ID `AW-…` + etiquetas de conversión | Medir leads (formularios) y contactos (WhatsApp/llamada) |
| **Meta Pixel / GTM** | IDs | Facebook/Instagram Ads y etiquetas adicionales |

Eventos que envía el sitio: `PageView`, `ViewContent` (fichas), `Search` (filtros), `Contact` (WhatsApp/teléfono/correo)
y `Lead` (formularios). En GA4 llegan como `view_item`, `search`, `contact` y `generate_lead`; a GTM como `eq_*`.

Lo que el sitio hace solo:
- Títulos, descripciones, canonical, Open Graph y datos estructurados (JSON-LD) en cada página.
- Vista previa de Google con consejos en el editor de propiedades, páginas y artículos.
- `sitemap.xml` con imágenes, `robots.txt` y páginas por zona (`/propiedades/zona-16/`).
- Redirecciones 301 automáticas al cambiar la URL de una propiedad o pasarla a VIP, y manuales desde el panel.
- Las vistas previas de Netlify (deploy previews) no se indexan.
- CSS y JS empaquetados y sin código sobrante, fotos en WebP, versión liviana de las portadas para celulares.
- Precarga de la imagen de portada en todas las páginas y caché de un año para los archivos con hash (`/assets/`).
- Fichas con datos estructurados completos: habitaciones, baños, m², amenidades, coordenadas (si el enlace de Google Maps
  las trae), asesor, video y fecha de actualización. La organización tiene un `@id` único que enlazan fichas y artículos.
- Migas de pan con la zona (Inicio › Propiedades › Zona 16 › Casa…), páginas por zona en inglés (`/en/properties/zona-16/`)
  con hreflang, y páginas zona + operación (`/propiedades/venta/zona-16/`) cuando hay al menos 2 propiedades y no repiten
  el listado de la zona.
- `FAQPage` en las páginas de preguntas frecuentes (cada `## ¿Pregunta?` del contenido).
- `lastmod` reales en el sitemap (fecha de la última modificación; se omite si no se conoce).
- `llms.txt` con el resumen del sitio y el inventario para buscadores con IA (ChatGPT, Perplexity, Copilot).
- Conversiones mejoradas de Google Ads: el correo y el teléfono del lead se envían cifrados (SHA-256) por gtag.
  Actívalas también en Google Ads → Objetivos → Configuración → Conversiones mejoradas.

### Search Console dentro del panel (sección "Google")

Muestra clics, impresiones, CTR y posición; las búsquedas y páginas que traen tráfico; **oportunidades** (búsquedas
en posición 4–20 o con pocos clics, ordenadas por clics que podrías ganar); búsquedas desde EE. UU.; páginas que
pierden clics; un inspector de URL ("¿está en Google?") y una revisión SEO de cada ficha.

Para activarla (una vez):
1. En Google Cloud Console, en el proyecto de Firebase, activa **Google Search Console API**.
2. Crea una cuenta de servicio y descarga su clave JSON (no la compartas).
3. En Netlify agrega las variables `GOOGLE_SA_EMAIL` (`client_email`) y `GOOGLE_SA_KEY` (`private_key`).
4. En Search Console → Configuración → Usuarios y permisos, agrega ese correo con permiso **Completo**.
5. Opcional: `GSC_PROPERTY` si la propiedad no es `sc-domain:` del dominio (también se cambia en el panel).

### Aviso automático a buscadores

Después de cada publicación en producción, la función `deploy-succeeded` envía todas las URLs del sitemap a
**IndexNow** (Bing, Copilot, Yandex) y, si Search Console está conectado, vuelve a enviar el sitemap a Google.
Google no admite IndexNow ni su API de indexación para inmuebles: para Google, el sitemap y Search Console son la vía.

## Desarrollo local

```bash
npm run build   # genera dist/
npm run serve   # http://localhost:8080
```

Los estilos base salen de `scss/` (compilados a `css/style.css` con Prepros); los propios están en
`css/site.css` y `css/vip.css`. Diseño basado en la plantilla *Property* de [Untree.co](https://untree.co) (CC BY 3.0).
