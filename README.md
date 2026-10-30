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

## Seguimiento

Meta Pixel y Google Tag Manager se configuran en *Contenido del sitio → SEO y seguimiento*. El sitio envía
`PageView`, `ViewContent` (fichas), `Search` (filtros), `Contact` (WhatsApp/teléfono/correo) y `Lead` (formularios).
Los mismos eventos se envían a `dataLayer` como `eq_*` para GTM.

## Desarrollo local

```bash
npm run build   # genera dist/
npm run serve   # http://localhost:8080
```

Los estilos base salen de `scss/` (compilados a `css/style.css` con Prepros); los propios están en
`css/site.css` y `css/vip.css`. Diseño basado en la plantilla *Property* de [Untree.co](https://untree.co) (CC BY 3.0).
