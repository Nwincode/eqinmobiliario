// Prepara una foto para subirla: la misma pieza para el panel (admin/js/form.js, con su marca de agua) y para el
// comprobante que el huésped adjunta en el chat de su reserva (js/reserva-chat.js, como window.EQImagen: el build la
// empaqueta con scripts/lib/assets.mjs). Sin dependencias del panel: corre en el navegador del visitante.
// HEIC/HEIF (fotos de iPhone): el navegador casi nunca los abre; se convierten con heic2any (se carga solo si hace falta).
// Servido desde el propio sitio (copia exacta de heic2any@0.0.4 de npm, licencia MIT): un CDN de fuera comprometido
// podría correr código en el panel con la sesión abierta.
const HEIC2ANY = '/admin/vendor/heic2any-0.0.4.min.js';
let heicCargando = null;
function cargarHeic2any() {
	if (window.heic2any) return Promise.resolve(window.heic2any);
	heicCargando ||= new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = HEIC2ANY;
		s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('heic2any no cargó')));
		s.onerror = () => { heicCargando = null; reject(new Error('No se pudo cargar el convertidor de HEIC')); };
		document.head.append(s);
	});
	return heicCargando;
}

async function abrirBitmap(blob) {
	try {
		return await createImageBitmap(blob, { imageOrientation: 'from-image' });
	} catch (err) {
		if (err && err.name === 'TypeError') return createImageBitmap(blob); // navegador sin la opción
		throw err;
	}
}

// Prepara una foto para subirla: gira según EXIF, reduce a máx. 1920 px (sin recortar) y la pasa a WebP 0.82.
// Acepta JPG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP y TIFF (si el navegador lo abre).
// Devuelve { blob, ancho, alto, hash, marca? } (hash = SHA-256 del archivo original, para no subir repetidas).
// `marcar(canvas)`: la marca de agua (solo el panel la pone, admin/js/form.js).
export async function procesarImagen(file, maxSize = 1920, quality = 0.82, { marcar = null } = {}) {
	const nombre = file.name || 'foto';
	const original = await file.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', original);
	const hash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
	const heic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(nombre);
	let bitmap = null;
	try {
		bitmap = await abrirBitmap(file);
	} catch {
		if (!heic) throw new Error(`«${nombre}»: el navegador no puede abrir este formato de imagen. Conviértela a JPG o PNG.`);
	}
	if (!bitmap) {
		try {
			const heic2any = await cargarHeic2any();
			const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
			bitmap = await abrirBitmap(Array.isArray(out) ? out[0] : out);
		} catch {
			throw new Error(`«${nombre}»: no se pudo convertir la foto HEIC. Ábrela en el teléfono y compártela como JPG.`);
		}
	}
	const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close?.();
	// Marca de agua (logo + eqinmobiliario.gt) para que una foto copiada muestre de dónde es.
	let conMarca = false;
	if (marcar) {
		try {
			await marcar(canvas);
			conMarca = true;
		} catch (err) {
			console.warn('No se pudo poner la marca de agua', err);
		}
	}
	let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
	if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
	if (!blob) throw new Error(`«${nombre}»: no se pudo procesar la imagen.`);
	return { blob, ancho: canvas.width, alto: canvas.height, hash, ...(conMarca ? { marca: true } : {}) };
}

