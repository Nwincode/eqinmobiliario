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

## Desarrollo local

```bash
npm run build   # genera dist/
npm run serve   # http://localhost:8080
```

Los estilos base salen de `scss/` (compilados a `css/style.css` con Prepros); los propios están en
`css/site.css` y `css/vip.css`. Diseño basado en la plantilla *Property* de [Untree.co](https://untree.co) (CC BY 3.0).
