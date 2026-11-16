// Fotos por el CDN de imágenes de Netlify (recorte y formato a pedido). Una sola regla para el sitio (templates.mjs)
// y los correos (netlify/lib/aviso-chat-envio.mjs): pasan las fotos de Firebase Storage y las del propio sitio (/images/…).
export const fotoCdn = (u, w, extra = '') => `/.netlify/images?url=${encodeURIComponent(u)}&w=${w}${extra}`;
export const pasaPorCdn = (url) => /^https:\/\/firebasestorage\.googleapis\.com\//.test(url || '') || /^\/images\/[^?#]+\.(webp|jpe?g|png)$/i.test(url || '');
