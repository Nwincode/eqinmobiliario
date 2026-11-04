// Lectura de Firestore por REST, sin dependencias. Solo lee datos públicos
// (los que las reglas permiten leer sin iniciar sesión).

function decodeValue(v) {
	if ('stringValue' in v) return v.stringValue;
	if ('booleanValue' in v) return v.booleanValue;
	if ('integerValue' in v) return Number(v.integerValue);
	if ('doubleValue' in v) return v.doubleValue;
	if ('nullValue' in v) return null;
	if ('timestampValue' in v) return v.timestampValue;
	if ('referenceValue' in v) return v.referenceValue;
	if ('geoPointValue' in v) return v.geoPointValue;
	if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
	if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
	return undefined;
}

function decodeFields(fields) {
	const out = {};
	for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
	return out;
}

function decodeDoc(doc) {
	return { id: doc.name.split('/').pop(), ...decodeFields(doc.fields || {}) };
}

export function createClient({ projectId, apiKey }) {
	const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
	const withKey = (url) => (apiKey ? `${url}${url.includes('?') ? '&' : '?'}key=${apiKey}` : url);

	async function request(url, options) {
		const res = await fetch(withKey(url), options);
		if (res.status === 404) return null;
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Firestore respondió ${res.status} en ${url}: ${body.slice(0, 300)}`);
		}
		return res.json();
	}

	return {
		async getDoc(path) {
			const json = await request(`${base}/${path}`);
			return json ? decodeDoc(json) : null;
		},

		// Consulta una colección filtrando por un campo booleano en true
		// (las reglas de seguridad exigen ese filtro para lecturas públicas).
		async queryTrue(collection, field) {
			const json = await request(`${base}:runQuery`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					structuredQuery: {
						from: [{ collectionId: collection }],
						where: {
							fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { booleanValue: true } }
						}
					}
				})
			});
			return (json || []).filter((r) => r.document).map((r) => decodeDoc(r.document));
		}
	};
}
