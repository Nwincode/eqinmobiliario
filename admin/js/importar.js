// Lógica pura de la importación masiva y del código de propiedad.
// Sin DOM ni Firebase: se puede probar con Node (CSV, números, códigos, zip, fotos).

// ---------- Texto ----------

// Minúsculas, sin tildes ni símbolos raros, espacios colapsados.
export function normalizar(s) {
	return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Clave para comparar nombres de carpeta, código o encabezado: solo [a-z0-9].
export function clave(s) {
	return normalizar(s).replace(/[^a-z0-9]/g, '');
}

// Propiedad que parece la misma aunque tenga otro código: misma operación y mismo título,
// o misma dirección con el mismo precio. Sirve para avisar antes de crearla dos veces.
export function buscarParecida(d, lista) {
	const t = clave(d.titulo), dir = clave(d.direccion);
	return lista.find((p) => (p.operacion || '') === (d.operacion || '')
		&& ((t && clave(p.titulo) === t) || (dir && clave(p.direccion) === dir && Number(p.precio) === Number(d.precio)))) || null;
}

// ---------- CSV ----------

// Bytes → texto. UTF-8; si salen caracteres de reemplazo (�), prueba windows-1252 (Excel en español).
export function decodificarCsv(bytes) {
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let txt = new TextDecoder('utf-8').decode(u8);
	if (txt.includes('�')) {
		try { txt = new TextDecoder('windows-1252').decode(u8); } catch { /* sin soporte: se queda UTF-8 */ }
	}
	return txt.replace(/^﻿/, '');
}

// Detecta el separador mirando la primera línea (fuera de comillas): ; , o tabulador.
export function detectarSeparador(text) {
	const cuenta = { ',': 0, ';': 0, '\t': 0 };
	let q = false;
	for (const ch of text) {
		if (ch === '"') q = !q;
		else if (!q && (ch === '\n' || ch === '\r')) break;
		else if (!q && ch in cuenta) cuenta[ch]++;
	}
	const [mejor, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
	return n > 0 ? mejor : ',';
}

// CSV → matriz de filas. Soporta comillas, "" escapadas, saltos de línea y separadores dentro de comillas.
export function parseCsv(text, sep) {
	text = String(text || '').replace(/^﻿/, '');
	sep = sep || detectarSeparador(text);
	const filas = [];
	let fila = [], campo = '', q = false, i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (q) {
			if (ch === '"') {
				if (text[i + 1] === '"') { campo += '"'; i += 2; continue; }
				q = false; i++; continue;
			}
			campo += ch; i++; continue;
		}
		if (ch === '"' && campo === '') { q = true; i++; continue; }
		if (ch === sep) { fila.push(campo); campo = ''; i++; continue; }
		if (ch === '\r' || ch === '\n') {
			fila.push(campo); filas.push(fila); fila = []; campo = '';
			if (ch === '\r' && text[i + 1] === '\n') i++;
			i++; continue;
		}
		campo += ch; i++;
	}
	if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
	// Quita filas completamente vacías.
	return filas.filter((f) => f.some((c) => String(c).trim() !== ''));
}

// Columnas de la plantilla y sus nombres alternativos (se comparan sin tildes ni mayúsculas).
export const COLUMNAS = [
	['codigo', ['codigo', 'code', 'ref', 'referencia', 'id_propiedad']],
	['carpeta', ['carpeta', 'folder', 'carpeta_fotos', 'fotos', 'carpeta_de_fotos']],
	['titulo', ['titulo', 'title', 'nombre', 'nombre_propiedad']],
	['operacion', ['operacion', 'operation', 'venta_renta']],
	['tipo', ['tipo', 'type', 'tipo_propiedad', 'tipo_de_propiedad']],
	['estado', ['estado', 'status', 'disponibilidad']],
	['asesor', ['asesor', 'agente', 'agent', 'asesor_id', 'agentid', 'agent_id', 'asesor_responsable']],
	['precio', ['precio', 'price', 'valor']],
	['moneda', ['moneda', 'currency', 'divisa']],
	['zona', ['zona', 'zone']],
	['ciudad', ['ciudad', 'municipio', 'city']],
	['direccion', ['direccion', 'residencial', 'address', 'ubicacion', 'residencial_direccion']],
	['condominio_siglas', ['condominio_siglas', 'siglas', 'siglas_condominio', 'condominio']],
	['habitaciones', ['habitaciones', 'cuartos', 'dormitorios', 'recamaras', 'habs']],
	['banos', ['banos', 'bathrooms', 'banos_completos']],
	['parqueos', ['parqueos', 'parqueo', 'estacionamientos', 'garage', 'garaje']],
	['m2_construccion', ['m2_construccion', 'construccion', 'metros_construccion', 'area_construccion', 'm2construccion', 'mts_construccion']],
	['m2_terreno', ['m2_terreno', 'terreno', 'metros_terreno', 'area_terreno', 'm2terreno', 'mts_terreno']],
	['niveles', ['niveles', 'pisos', 'plantas']],
	['anio_construccion', ['anio_construccion', 'ano_construccion', 'anio', 'ano', 'year_built']],
	['mantenimiento', ['mantenimiento', 'cuota_mantenimiento', 'cuota']],
	['amenidades', ['amenidades', 'amenities', 'amenidad']],
	['descripcion', ['descripcion', 'description', 'detalle']],
	['video', ['video', 'youtube', 'video_url']],
	// Renta vacacional (operación «vacacional»). Lo del socio se guarda en privado.
	['socio_noche', ['socio_noche', 'precio_socio', 'precio_noche_socio', 'costo_noche', 'precio_noche', 'costo_socio']],
	['socio_finde', ['socio_finde', 'precio_finde_socio', 'costo_finde', 'precio_fin_de_semana', 'precio_finde']],
	['margen', ['margen', 'ganancia', 'margen_empresa']],
	['limpieza', ['limpieza', 'cargo_limpieza', 'cleaning', 'cleaning_fee']],
	['deposito', ['deposito', 'deposito_reembolsable', 'deposit']],
	['noches_min', ['noches_min', 'noches_minimas', 'minimo_noches', 'min_noches']],
	['huespedes_max', ['huespedes_max', 'huespedes', 'capacidad', 'personas', 'max_huespedes']],
	['ical', ['ical', 'calendario', 'calendario_airbnb', 'ical_url', 'enlace_ical']]
	// El socio (nombre, teléfono) no va en el CSV: se elige en la ficha y sus datos viven en Propietarios.
];

const ALIAS = new Map();
for (const [col, alias] of COLUMNAS) for (const a of alias) ALIAS.set(clave(a), col);

// Encabezados → índice de cada columna conocida. Devuelve { indices, desconocidas }.
export function mapearEncabezados(encabezados) {
	const indices = {}, desconocidas = [];
	encabezados.forEach((h, i) => {
		const col = ALIAS.get(clave(h));
		if (col && !(col in indices)) indices[col] = i;
		else if (String(h).trim()) desconocidas.push(String(h).trim());
	});
	return { indices, desconocidas };
}

// Matriz → objetos { columna: valor } numerados desde 1 (la primera propiedad; el encabezado no cuenta).
export function filasComoObjetos(matriz) {
	if (!matriz.length) return { filas: [], desconocidas: [], indices: {} };
	const { indices, desconocidas } = mapearEncabezados(matriz[0]);
	const filas = matriz.slice(1).map((f, n) => {
		const o = { _fila: n + 1 };
		for (const [col, i] of Object.entries(indices)) o[col] = String(f[i] ?? '').trim();
		return o;
	});
	return { filas, desconocidas, indices };
}

// Número tolerante: "Q 1,250,000", "1.250.000", "$350,000.50", "1.250,5", "2½" no. Vacío → null; inválido → NaN.
export function parseNumero(v) {
	let s = String(v ?? '').trim();
	if (!s) return null;
	s = s.replace(/[^\d.,-]/g, '');
	if (!/\d/.test(s)) return NaN;
	const neg = s.startsWith('-');
	s = s.replace(/-/g, '');
	const puntos = (s.match(/\./g) || []).length, comas = (s.match(/,/g) || []).length;
	if (puntos && comas) {
		// El último que aparece es el decimal.
		const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
		const mil = dec === '.' ? ',' : '.';
		s = s.split(mil).join('').replace(dec, '.');
	} else if (puntos > 1 || comas > 1) {
		s = s.replace(/[.,]/g, ''); // varios separadores iguales = miles
	} else if (puntos === 1 || comas === 1) {
		const sepCh = puntos ? '.' : ',';
		const [ent, frac] = s.split(sepCh);
		// "1.250" o "350,000" (3 dígitos y entero corto distinto de 0) = miles; si no, decimal.
		if (frac.length === 3 && ent.length >= 1 && ent.length <= 3 && ent !== '0') s = ent + frac;
		else s = ent + '.' + frac;
	}
	const n = Number(s);
	return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

// Lista "Piscina; Garita | Jardín" → ['Piscina','Garita','Jardín'].
export function parseLista(v) {
	return String(v ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);
}

// Valor → clave de opción. Acepta la clave o la etiqueta (sin tildes ni mayúsculas) y sinónimos.
export function mapearOpcion(v, opciones, sinonimos = {}) {
	const k = clave(v);
	if (!k) return '';
	for (const [valor, label] of opciones) {
		if (clave(valor) === k || clave(label) === k) return valor;
	}
	if (sinonimos[k]) return sinonimos[k];
	// Etiqueta que empieza igual ("Reservada / con oferta" ← "reservada").
	for (const [valor, label] of opciones) {
		const kl = clave(label);
		if (kl.startsWith(k) && k.length >= 4) return valor;
	}
	return null;
}

export const SINONIMOS = {
	operacion: { alquiler: 'renta', arrendamiento: 'renta', rent: 'renta', sale: 'venta', sell: 'venta', vender: 'venta', rentar: 'renta' },
	tipo: { apto: 'apartamento', depto: 'apartamento', departamento: 'apartamento', apartment: 'apartamento', house: 'casa', land: 'terreno', lote: 'terreno', office: 'oficina', localcomercial: 'local', warehouse: 'bodega', galera: 'bodega' },
	estado: { available: 'disponible', activa: 'disponible', activo: 'disponible', vendido: 'vendida', rentado: 'rentada', reservado: 'reservada', ofertada: 'reservada', pausado: 'pausada', retirado: 'retirada', proximo: 'proximamente' },
	moneda: { usd: 'USD', dolares: 'USD', dolar: 'USD', us: 'USD', gtq: 'GTQ', q: 'GTQ', quetzales: 'GTQ', quetzal: 'GTQ' }
};

// ---------- Código de propiedad: CONDOMINIO-ZONA-ASESOR-NNN ----------

// Mayúsculas, sin tildes ni espacios, con guiones.
export function normalizarCodigo(v) {
	return String(v ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase()
		.replace(/[\s_]+/g, '-').replace(/[^A-Z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const VACIAS = new Set(['residencial', 'residenciales', 'condominio', 'condominios', 'cond', 'res', 'resid', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'club']);
const PALABRAS_CONDO = /\b(residencial|residenciales|condominio|cond|res|club|villas?|torres?|lomas|bosques?|jardines|hacienda)\b/;
const PALABRAS_CALLE = /\b(calle|avenida|av|ave|km|kilometro|carretera|diagonal|zona|lote|manzana|mz|casa|no)\b/;

// Siglas del condominio: las escritas a mano o deducidas de la dirección. Sin condominio → IND.
export function siglasCondominio(siglas, direccion) {
	const s = normalizarCodigo(siglas).replace(/-/g, '');
	if (s) return s.slice(0, 6);
	const parte = normalizar(String(direccion || '').split(/[,;(]/)[0]);
	if (!parte) return 'IND';
	const esCondo = PALABRAS_CONDO.test(parte);
	if (!esCondo && (/\d/.test(parte) || PALABRAS_CALLE.test(parte))) return 'IND';
	const palabras = parte.replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w && !VACIAS.has(w) && !/^\d+$/.test(w));
	if (!palabras.length) return 'IND';
	if (palabras.length === 1) return palabras[0].slice(0, 3).toUpperCase();
	return palabras.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
}

// Zona: "Zona 15" → Z15; sin número → 3 primeras letras de la ciudad.
export function zonaCodigo(zona, ciudad) {
	const m = String(zona || '').match(/\d+/);
	if (m) return `Z${Number(m[0])}`;
	const c = normalizar(ciudad).replace(/[^a-z]/g, '');
	return (c.slice(0, 3) || 'GUA').toUpperCase();
}

// Iniciales del asesor: primera letra de las dos primeras palabras ("Juan Pérez" → JP). Sin asesor → EQ.
export function inicialesAsesor(nombre) {
	const p = normalizar(nombre).replace(/[^a-z ]/g, ' ').split(' ').filter((w) => w && !['de', 'del', 'la', 'los', 'las', 'y'].includes(w));
	if (!p.length) return 'EQ';
	if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
	return (p[0][0] + p[1][0]).toUpperCase();
}

// Mayor NNN entre los códigos del mismo asesor + 1, a 3 dígitos.
export function siguienteCorrelativo(codigos, iniciales) {
	let max = 0;
	for (const c of codigos || []) {
		const partes = normalizarCodigo(c).split('-');
		if (partes.length < 2) continue;
		const nnn = partes[partes.length - 1], ini = partes[partes.length - 2];
		if (ini === iniciales && /^\d+$/.test(nnn)) max = Math.max(max, Number(nnn));
	}
	return String(max + 1).padStart(3, '0');
}

// Genera el código de una propiedad. agentes: [{id,nombre}], codigos: códigos ya usados.
export function generarCodigo(p, { agentes = [], codigos = [] } = {}) {
	const ag = agentes.find((a) => a.id === p.agentId);
	const ini = inicialesAsesor(ag?.nombre);
	const base = `${siglasCondominio(p.condominioSiglas, p.direccion)}-${zonaCodigo(p.zona, p.ciudad)}-${ini}`;
	return `${base}-${siguienteCorrelativo(codigos, ini)}`;
}

// Asesor por nombre, iniciales o id. Devuelve el id, '' si vacío o null si no se encontró.
export function mapearAsesor(v, agentes) {
	const k = clave(v);
	if (!k) return '';
	const a = agentes.find((x) => x.id === String(v).trim())
		|| agentes.find((x) => clave(x.nombre) === k)
		|| agentes.find((x) => clave(x.email || '').startsWith(k) && k.length >= 3)
		|| agentes.find((x) => clave(x.nombre).startsWith(k) && k.length >= 3)
		|| agentes.filter((x) => normalizar(x.nombre).split(' ').some((w) => clave(w) === k)).at(0);
	return a ? a.id : null;
}

// ---------- Fila del CSV → datos de propiedad ----------

// opciones: { operacion, tipo, estado, moneda } como listas [valor, etiqueta].
// Devuelve { datos, errores }. datos solo trae los campos con valor en el CSV.
export function filaAPropiedad(fila, { opciones, agentes = [] }) {
	const datos = {}, errores = [];
	const txt = (c) => String(fila[c] ?? '').trim();
	if (txt('titulo')) datos.titulo = txt('titulo');
	else errores.push('Falta el título');
	if (txt('codigo')) datos.codigo = normalizarCodigo(txt('codigo'));
	for (const c of ['operacion', 'tipo', 'estado', 'moneda']) {
		if (!txt(c)) continue;
		const v = mapearOpcion(txt(c), opciones[c], SINONIMOS[c]);
		if (v) datos[c] = v;
		else errores.push(`${{ operacion: 'Operación no válida', tipo: 'Tipo no válido', estado: 'Estado no válido', moneda: 'Moneda no válida' }[c]}: «${txt(c)}»`);
	}
	if (txt('asesor')) {
		const id = mapearAsesor(txt('asesor'), agentes);
		if (id) datos.agentId = id;
		else errores.push(`Asesor no encontrado: «${txt('asesor')}»`);
	}
	const numeros = { precio: 'precio', habitaciones: 'habitaciones', banos: 'banos', parqueos: 'parqueos', m2_construccion: 'm2Construccion', m2_terreno: 'm2Terreno', niveles: 'niveles', anio_construccion: 'anioConstruccion', mantenimiento: 'mantenimiento' };
	for (const [c, campo] of Object.entries(numeros)) {
		if (!txt(c)) continue;
		const n = parseNumero(txt(c));
		if (n === null) continue;
		if (Number.isNaN(n) || n < 0) errores.push(`Número no válido en ${{ banos: 'baños', m2_construccion: 'm² de construcción', m2_terreno: 'm² de terreno', anio_construccion: 'año de construcción' }[c] || c}: «${txt(c)}»`);
		else datos[campo] = n;
	}
	for (const c of ['zona', 'ciudad', 'direccion', 'descripcion']) if (txt(c)) datos[c] = txt(c);
	if (/^\d+$/.test(datos.zona || '')) datos.zona = `Zona ${datos.zona}`; // "15" → "Zona 15"
	if (txt('condominio_siglas')) datos.condominioSiglas = normalizarCodigo(txt('condominio_siglas')).replace(/-/g, '');
	if (txt('amenidades')) datos.amenidades = parseLista(txt('amenidades'));
	if (txt('video')) {
		if (/^https:\/\//i.test(txt('video'))) datos.video = txt('video');
		else errores.push('El video debe ser un enlace que empiece con https://');
	}
	// Renta vacacional: lo público (limpieza, depósito, noches, huéspedes) va en «vac»;
	// lo del socio (costo, margen, iCal) va en «socio» y se guarda aparte, en privado.
	const vac = {}, socio = {};
	const vacNum = { limpieza: ['vac', 'limpieza'], deposito: ['vac', 'deposito'], noches_min: ['vac', 'nochesMin'], huespedes_max: ['vac', 'huespedesMax'], socio_noche: ['socio', 'precioBase'], socio_finde: ['socio', 'precioFinde'], margen: ['socio', 'margen'] };
	for (const [c, [dest, campo]] of Object.entries(vacNum)) {
		if (!txt(c)) continue;
		const n = parseNumero(txt(c).replace('%', ''));
		if (n === null) continue;
		if (Number.isNaN(n) || n < 0) errores.push(`Número no válido en ${c.replace('_', ' ')}: «${txt(c)}»`);
		else (dest === 'vac' ? vac : socio)[campo] = n;
	}
	if (txt('ical')) {
		if (/^https:\/\//i.test(txt('ical'))) socio.icalUrl = txt('ical');
		else errores.push('El enlace del calendario (ical) debe empezar con https://');
	}
	if (datos.operacion === 'vacacional' && !datos.codigo && !(socio.precioBase > 0)) errores.push('Renta vacacional: falta el precio por noche del socio (socio_noche)');
	return { datos, errores, carpeta: txt('carpeta'), vac, socio };
}

// ---------- Fotos ----------

const EXT_IMAGEN = /\.(jpe?g|png|webp|gif|bmp|tiff?|avif|heic|heif)$/i;
export function esImagen(nombre, tipo = '') {
	const base = String(nombre).split('/').pop();
	if (base.startsWith('.') || base.startsWith('._')) return false;
	return EXT_IMAGEN.test(base) || /^image\//.test(tipo);
}
export function esHeic(nombre, tipo = '') {
	return /image\/hei[cf]/i.test(tipo) || /\.hei[cf]$/i.test(nombre);
}

// Orden natural: "foto2" antes que "foto10".
const COLL = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export function ordenNatural(a, b) { return COLL.compare(String(a), String(b)); }

// Ancho y alto leyendo solo la cabecera del archivo (sin decodificar). null si no se reconoce.
export function dimensionesDeCabecera(bytes) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
	const n = b.length;
	const str = (o, l) => String.fromCharCode(...b.subarray(o, o + l));
	try {
		// PNG
		if (n > 24 && b[0] === 0x89 && str(1, 3) === 'PNG') return { ancho: dv.getUint32(16), alto: dv.getUint32(20) };
		// GIF
		if (n > 10 && str(0, 3) === 'GIF') return { ancho: dv.getUint16(6, true), alto: dv.getUint16(8, true) };
		// BMP
		if (n > 26 && str(0, 2) === 'BM') return { ancho: Math.abs(dv.getInt32(18, true)), alto: Math.abs(dv.getInt32(22, true)) };
		// WebP
		if (n > 30 && str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
			const t = str(12, 4);
			if (t === 'VP8 ') return { ancho: dv.getUint16(26, true) & 0x3fff, alto: dv.getUint16(28, true) & 0x3fff };
			if (t === 'VP8L') { const v = dv.getUint32(21, true); return { ancho: (v & 0x3fff) + 1, alto: ((v >> 14) & 0x3fff) + 1 }; }
			if (t === 'VP8X') return { ancho: 1 + (b[24] | b[25] << 8 | b[26] << 16), alto: 1 + (b[27] | b[28] << 8 | b[29] << 16) };
		}
		// JPEG: busca el marcador SOF; si hay EXIF con rotación 90°, intercambia (no importa para el lado mayor).
		if (n > 4 && b[0] === 0xff && b[1] === 0xd8) {
			let o = 2;
			while (o + 9 < n) {
				if (b[o] !== 0xff) { o++; continue; }
				const m = b[o + 1];
				if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { o += m === 0xff ? 1 : 2; continue; }
				const len = dv.getUint16(o + 2);
				if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: dv.getUint16(o + 5), ancho: dv.getUint16(o + 7) };
				o += 2 + len;
			}
			return null;
		}
		// HEIC/AVIF (ISO BMFF): caja 'ispe' con ancho y alto.
		if (n > 12 && str(4, 4) === 'ftyp') {
			const lim = Math.min(n - 12, 1 << 20);
			for (let o = 8; o < lim; o++) {
				if (b[o] === 0x69 && str(o, 4) === 'ispe') return { ancho: dv.getUint32(o + 8), alto: dv.getUint32(o + 12) };
			}
		}
	} catch { /* cabecera truncada */ }
	return null;
}

// ---------- Zip (lectura) ----------

const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function cp437(bytes) {
	let s = '';
	for (const c of bytes) s += c < 128 ? String.fromCharCode(c) : CP437[c - 128];
	return s;
}

// Lee el directorio central de un zip (Blob/File). Devuelve [{ nombre, tamano, leer(): Promise<Blob> }].
// Admite "stored" (0) y "deflate" (8, con DecompressionStream). Ignora carpetas, __MACOSX y .DS_Store.
export async function leerZip(blob) {
	const tam = blob.size;
	const colaLen = Math.min(tam, 65557);
	const cola = new Uint8Array(await blob.slice(tam - colaLen).arrayBuffer());
	let eocd = -1;
	for (let i = cola.length - 22; i >= 0; i--) {
		if (cola[i] === 0x50 && cola[i + 1] === 0x4b && cola[i + 2] === 0x05 && cola[i + 3] === 0x06) { eocd = i; break; }
	}
	if (eocd < 0) throw new Error('El archivo no es un .zip válido.');
	const dvc = new DataView(cola.buffer);
	let total = dvc.getUint16(eocd + 10, true);
	let cdTam = dvc.getUint32(eocd + 12, true);
	let cdOff = dvc.getUint32(eocd + 16, true);
	// Zip64
	if (cdOff === 0xffffffff || total === 0xffff) {
		const loc = eocd - 20;
		if (loc >= 0 && dvc.getUint32(loc, true) === 0x07064b50) {
			const off64 = Number(dvc.getBigUint64(loc + 8, true));
			const rec = new DataView(await blob.slice(off64, off64 + 56).arrayBuffer());
			if (rec.getUint32(0, true) === 0x06064b50) {
				total = Number(rec.getBigUint64(32, true));
				cdTam = Number(rec.getBigUint64(40, true));
				cdOff = Number(rec.getBigUint64(48, true));
			}
		}
	}
	const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdTam).arrayBuffer());
	const dv = new DataView(cd.buffer);
	const utf8 = new TextDecoder('utf-8');
	const entradas = [];
	let o = 0;
	for (let k = 0; k < total && o + 46 <= cd.length; k++) {
		if (dv.getUint32(o, true) !== 0x02014b50) throw new Error('El .zip está dañado (directorio central).');
		const flags = dv.getUint16(o + 8, true);
		const metodo = dv.getUint16(o + 10, true);
		let comp = dv.getUint32(o + 20, true);
		let tamano = dv.getUint32(o + 24, true);
		const nLen = dv.getUint16(o + 28, true), eLen = dv.getUint16(o + 30, true), cLen = dv.getUint16(o + 32, true);
		let local = dv.getUint32(o + 42, true);
		const nb = cd.subarray(o + 46, o + 46 + nLen);
		const nombre = (flags & 0x800) ? utf8.decode(nb) : cp437(nb);
		// Campo extra zip64
		let e = o + 46 + nLen;
		const eFin = e + eLen;
		while (e + 4 <= eFin) {
			const id = dv.getUint16(e, true), l = dv.getUint16(e + 2, true);
			if (id === 0x0001) {
				let p = e + 4;
				if (tamano === 0xffffffff) { tamano = Number(dv.getBigUint64(p, true)); p += 8; }
				if (comp === 0xffffffff) { comp = Number(dv.getBigUint64(p, true)); p += 8; }
				if (local === 0xffffffff) { local = Number(dv.getBigUint64(p, true)); }
			}
			e += 4 + l;
		}
		o = eFin + cLen;
		const base = nombre.split('/').pop();
		if (nombre.endsWith('/') || /(^|\/)__MACOSX\//.test(nombre) || base === '.DS_Store' || base.startsWith('._')) continue;
		entradas.push({
			nombre, tamano, metodo, cifrado: !!(flags & 1),
			async leer() {
				if (this.cifrado) throw new Error(`«${base}» está protegido con contraseña.`);
				const lh = new DataView(await blob.slice(local, local + 30).arrayBuffer());
				if (lh.getUint32(0, true) !== 0x04034b50) throw new Error(`«${base}»: el .zip está dañado.`);
				const ini = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
				const datos = blob.slice(ini, ini + comp);
				if (metodo === 0) return datos;
				if (metodo === 8) {
					if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir .zip comprimidos; usa una carpeta.');
					return await new Response(datos.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
				}
				throw new Error(`«${base}» usa un tipo de compresión no compatible.`);
			}
		});
	}
	return entradas;
}

// ---------- Agrupar fotos por propiedad ----------

// archivos: [{ ruta: 'carpeta/sub/foto.jpg', ... }]. filas: [{ claves: ['carpeta','codigo'] }] (en orden).
// Devuelve { porFila: Map(indice → [archivos]), sinFila: [{ nombre, fotos }], ignorados: n }.
export function agruparFotos(archivos, filas) {
	const imgs = [];
	let ignorados = 0;
	for (const a of archivos) {
		const ruta = String(a.ruta || '').replace(/\\/g, '/').replace(/^\/+/, '');
		if (/(^|\/)__MACOSX\//.test(ruta) || !esImagen(ruta, a.tipo)) { ignorados++; continue; }
		imgs.push({ ...a, ruta, partes: ruta.split('/') });
	}
	const indice = new Map(); // clave → fila
	filas.forEach((f, i) => { for (const k of f.claves) { const c = clave(k); if (c && !indice.has(c)) indice.set(c, i); } });

	// Si todo cuelga de una sola carpeta envoltorio que no es de ninguna fila, se quita.
	const primeros = new Set(imgs.map((x) => (x.partes.length > 1 ? x.partes[0] : '')));
	if (primeros.size === 1 && !primeros.has('') && !indice.has(clave([...primeros][0]))) {
		for (const x of imgs) x.partes = x.partes.slice(1);
	}
	// Repite por si había dos niveles (carpeta elegida + carpeta dentro del zip).
	const primeros2 = new Set(imgs.map((x) => (x.partes.length > 1 ? x.partes[0] : '')));
	if (primeros2.size === 1 && !primeros2.has('') && !indice.has(clave([...primeros2][0]))) {
		for (const x of imgs) x.partes = x.partes.slice(1);
	}

	const porFila = new Map();
	const sinFila = new Map();
	const agregar = (i, x) => { if (!porFila.has(i)) porFila.set(i, []); porFila.get(i).push(x); };
	for (const x of imgs) {
		if (x.partes.length > 1) {
			const carpeta = x.partes[0];
			const i = indice.get(clave(carpeta));
			if (i !== undefined) agregar(i, x);
			else {
				if (!sinFila.has(carpeta)) sinFila.set(carpeta, 0);
				sinFila.set(carpeta, sinFila.get(carpeta) + 1);
			}
			continue;
		}
		// Archivo suelto: CODIGO-1.jpg, CODIGO_2.jpg, CODIGO 3.jpg o CODIGO.jpg
		const nombre = normalizar(x.partes[0].replace(/\.[^.]+$/, ''));
		const m = nombre.match(/^(.+?)[-_ ]+\d+$/);
		// Si el CSV trae una sola propiedad, las fotos sueltas son de ella aunque no lleven el código.
		const i = (m && indice.get(clave(m[1]))) ?? indice.get(clave(nombre)) ?? (filas.length === 1 ? 0 : undefined);
		const hecho = i !== undefined;
		if (hecho) agregar(i, x);
		if (!hecho) {
			const k = '(archivos sueltos)';
			sinFila.set(k, (sinFila.get(k) || 0) + 1);
		}
	}
	for (const lista of porFila.values()) lista.sort((a, b) => ordenNatural(a.ruta, b.ruta));
	return {
		porFila,
		sinFila: [...sinFila.entries()].map(([nombre, fotos]) => ({ nombre, fotos })).sort((a, b) => ordenNatural(a.nombre, b.nombre)),
		ignorados
	};
}

// Hash SHA-256 en hexadecimal (navegador y Node 20+).
export async function sha256(buffer) {
	const h = await crypto.subtle.digest('SHA-256', buffer);
	return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Plantilla CSV (encabezados + 2 ejemplos).
export const PLANTILLA = [
	['codigo', 'carpeta', 'titulo', 'operacion', 'tipo', 'estado', 'asesor', 'precio', 'moneda', 'zona', 'ciudad', 'direccion', 'condominio_siglas', 'habitaciones', 'banos', 'parqueos', 'm2_construccion', 'm2_terreno', 'niveles', 'anio_construccion', 'mantenimiento', 'amenidades', 'descripcion', 'video', 'socio_noche', 'socio_finde', 'margen', 'limpieza', 'deposito', 'noches_min', 'huespedes_max', 'ical'],
	['', 'casa-vista-lomas', 'Casa con jardín en Vista de las Lomas', 'venta', 'casa', 'disponible', 'Juan Pérez', '350000', 'USD', 'Zona 15', 'Guatemala', 'Residencial Vista de las Lomas', 'VLM', '4', '3.5', '2', '320', '400', '2', '2018', '150', 'Piscina; Garita; Jardín', 'Casa de dos niveles con jardín y sala familiar.', '', '', '', '', '', '', '', '', ''],
	['', 'apto-z10', 'Apartamento amueblado en zona 10', 'renta', 'apartamento', 'disponible', 'Juan Pérez', '1,500', 'USD', 'Zona 10', 'Guatemala', '', '', '2', '2', '1', '95', '', '', '2020', '250', 'Gimnasio | Elevador', 'Apartamento con vista y balcón.', 'https://www.youtube.com/watch?v=XXXXXXXXXXX', '', '', '', '', '', '', '', ''],
	['', 'casa-lago-atitlan', 'Casa frente al lago en Panajachel', 'vacacional', 'casa', 'disponible', 'Juan Pérez', '', 'USD', '', 'Panajachel', '', '', '3', '2', '2', '', '', '1', '', '', 'Piscina; Muelle; Wifi', 'Casa con vista al lago para fines de semana.', '', '100', '130', '20', '40', '150', '2', '6', 'https://www.airbnb.com/calendar/ical/XXXX.ics']
];
