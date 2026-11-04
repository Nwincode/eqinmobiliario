// Calificación y reseñas de la ficha de Google Maps de la oficina. GET /api/resenas-google?lang=es|en
// Variables de entorno en Netlify: GOOGLE_PLACES_API_KEY y GOOGLE_PLACE_ID.
// Sin esas variables responde { configurado: false } y el sitio muestra solo las reseñas del panel.
// Google no permite guardar las reseñas: se leen en cada consulta y el CDN las recuerda solo 1 hora.

const CAMPOS = 'rating,userRatingCount,reviews,googleMapsUri,googleMapsLinks';

function respuesta(status, body, cacheSegundos = 0) {
	const headers = { 'Content-Type': 'application/json; charset=utf-8' };
	if (cacheSegundos) {
		headers['Cache-Control'] = 'public, max-age=300';
		headers['Netlify-CDN-Cache-Control'] = `public, s-maxage=${cacheSegundos}, stale-while-revalidate=600`;
		headers['Netlify-Vary'] = 'query=lang';
	} else {
		headers['Cache-Control'] = 'no-store';
	}
	return new Response(JSON.stringify(body), { status, headers });
}

const resena = (r) => ({
	autor: r.authorAttribution?.displayName || '',
	autorUrl: r.authorAttribution?.uri || '',
	autorFoto: r.authorAttribution?.photoUri || '',
	estrellas: r.rating || 0,
	texto: r.text?.text || r.originalText?.text || '',
	fecha: r.relativePublishTimeDescription || '',
	enlace: r.googleMapsUri || ''
});

export default async (req) => {
	const key = process.env.GOOGLE_PLACES_API_KEY;
	const placeId = process.env.GOOGLE_PLACE_ID;
	if (!key || !placeId) return respuesta(200, { configurado: false }, 3600);

	const lang = new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'es';
	try {
		const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${lang}`, {
			headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': CAMPOS }
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			console.error('Places API', res.status, data.error?.message);
			return respuesta(502, { configurado: true, error: 'No se pudieron leer las reseñas de Google.' });
		}
		return respuesta(200, {
			configurado: true,
			calificacion: data.rating || 0,
			total: data.userRatingCount || 0,
			verEnGoogle: data.googleMapsLinks?.reviewsUri || data.googleMapsUri || '',
			dejarResena: data.googleMapsLinks?.writeAReviewUri || '',
			resenas: (data.reviews || []).map(resena).filter((r) => r.texto)
		}, 3600);
	} catch (err) {
		console.error('Places API', err);
		return respuesta(502, { configurado: true, error: 'No se pudieron leer las reseñas de Google.' });
	}
};

export const config = { path: '/api/resenas-google' };
