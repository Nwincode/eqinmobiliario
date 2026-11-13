// Importación masiva de propiedades desde un CSV con sus fotos (carpeta o .zip). Solo administradores.
// Ruta: #/propiedades/importar. Nada se guarda hasta pulsar «Importar N propiedades».
import { db, doc, getDoc, collection, setDoc, updateDoc, serverTimestamp, Timestamp } from '../firebase.js';
import { h, mount, toast, errorMessage, iconoBtn, downloadCsv, slugify, cajaTabla, badge, formatPrice } from '../ui.js';
import { uploadImage, procesarImagen, deleteImage } from '../form.js';
import { session, loadAgents, markPending } from '../session.js';
import { estadoDe } from '../estados.js';
import { OPERACIONES, TIPOS, ESTADOS, MONEDAS, datosIniciales, entradaHistorial, loadAll, vacacionalPublico, faltaIngles, traducirEn, datosDe } from './properties.js';
import {
	decodificarCsv, parseCsv, filasComoObjetos, filaAPropiedad, generarCodigo, normalizarCodigo, buscarParecida,
	leerZip, agruparFotos, dimensionesDeCabecera, PLANTILLA
} from '../importar.js';

const FOTO_MINIMA = 800; // px del lado mayor
const FOTOS_EN_PARALELO = 3;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const icono = (cls) => h('span', { class: cls, 'aria-hidden': 'true' });

// Ejecuta fn sobre cada elemento con un máximo de n a la vez.
async function enParalelo(items, n, fn) {
	let i = 0;
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
		while (i < items.length) { const k = i++; await fn(items[k], k); }
	}));
}

const TIPO_POR_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif' };
const comoArchivo = (blob, nombre) => new File([blob], nombre, { type: blob.type || TIPO_POR_EXT[nombre.split('.').pop().toLowerCase()] || '' });

const V = window.EQVacacional;

// Renta vacacional: une lo del CSV con lo ya guardado y calcula los precios públicos (costo × margen).
// Devuelve null si no es vacacional. El costo del socio queda solo en properties/{id}/privado/socio.
async function prepararVacacional(id, it, previo = null) {
	if ((it.datos.operacion || previo?.operacion) !== 'vacacional') return null;
	const privRef = doc(db, 'properties', id, 'privado', 'socio');
	const guardado = previo ? ((await getDoc(privRef).catch(() => null))?.data() || {}) : {};
	const socio = { margen: V.MARGEN, tarifas: [], nombre: '', telefono: '', icalUrl: '', precioFinde: 0, ...guardado, ...(it.socio || {}) };
	if (!(Number(socio.precioBase) > 0)) throw new Error('Falta el precio por noche del socio (columna socio_noche).');
	const vacacional = { nochesMin: 1, huespedesMax: 2, checkIn: '15:00', checkOut: '11:00', ...(previo?.vacacional || {}), ...(it.vac || {}) };
	const pub = vacacionalPublico({ socio, vacacional });
	const { updatedAt, updatedBy, ...resto } = socio;
	// La dirección de una casa por noche es privada (privado/llegada): sale de lo que va al documento público.
	const llegada = 'direccion' in it.datos ? { direccion: it.datos.direccion } : null;
	if (llegada) it.datos.direccion = '';
	return { privRef, pub, socio: resto, llegada, llegadaRef: doc(db, 'properties', id, 'privado', 'llegada') };
}
const guardarSocio = async (v) => {
	if (!v) return;
	const sello = { updatedAt: serverTimestamp(), updatedBy: session.user.uid };
	await setDoc(v.privRef, { ...v.socio, ...sello });
	// «merge»: conserva el mapa ya guardado (el CSV no lo trae).
	if (v.llegada) await setDoc(v.llegadaRef, { mapa: '', ...((await getDoc(v.llegadaRef)).data() || {}), ...v.llegada, ...sello });
};

export async function render(container) {
	container.replaceChildren();
	const encabezado = h('div', { class: 'd-flex align-items-center gap-2 mb-3' },
		iconoBtn('icon-arrow-left', 'Volver a propiedades', { href: '#/propiedades', class: 'cot-btn cot-btn-icono btn btn-link text-body' }),
		h('h1', { class: 'h3 mb-0' }, 'Importar propiedades'));
	if (!session.isAdmin) {
		mount(container, encabezado,
			h('div', { class: 'alert alert-info' }, 'Solo un administrador puede importar propiedades.'));
		return;
	}
	const [agentes, existentes] = await Promise.all([loadAgents(), loadAll()]);
	const opciones = { operacion: OPERACIONES, tipo: TIPOS, estado: ESTADOS, moneda: MONEDAS };

	let filasCsv = null;      // [{ datos, errores, ... }]
	let nombreCsv = '';
	let fotos = [];           // [{ ruta, tipo, tamano, abrir() }]
	let fuenteFotos = '';
	let importando = false;

	// ---------- Paso 1: archivos ----------
	const inCsv = h('input', { type: 'file', class: 'form-control', id: 'imp-csv', accept: '.csv,text/csv' });
	const inCarpeta = h('input', { type: 'file', class: 'form-control', id: 'imp-carpeta', multiple: true, webkitdirectory: '', directory: '' });
	const inZip = h('input', { type: 'file', class: 'form-control', id: 'imp-zip', accept: '.zip,application/zip' });
	const estadoCsv = h('div', { class: 'form-text', 'aria-live': 'polite' }, 'Una fila por propiedad. Solo «titulo» es obligatorio.');
	const estadoFotos = h('div', { class: 'form-text', 'aria-live': 'polite' }, 'Una carpeta por propiedad, con su código o el nombre de la columna «carpeta».');
	const paso1 = h('section', { class: 'card imp-paso' }, h('div', { class: 'card-body' },
		h('div', { class: 'd-flex justify-content-between align-items-center gap-2 mb-3' },
			h('h2', { class: 'imp-paso-titulo mb-0' }, h('span', { class: 'imp-num' }, '1'), 'Archivos'),
			h('button', { type: 'button', class: 'btn btn-sm btn-outline-primary', onclick: () => downloadCsv('plantilla-propiedades.csv', PLANTILLA) },
				icono('icon-download'), ' Plantilla')),
		h('div', { class: 'row g-3' },
			h('div', { class: 'col-12 col-lg-4' },
				h('label', { class: 'form-label', for: 'imp-csv' }, icono('icon-file-excel-o'), ' CSV *'), inCsv, estadoCsv),
			h('div', { class: 'col-12 col-lg-4' },
				h('label', { class: 'form-label', for: 'imp-carpeta' }, icono('icon-folder-open'), ' Carpeta de fotos'), inCarpeta, estadoFotos),
			h('div', { class: 'col-12 col-lg-4' },
				h('label', { class: 'form-label', for: 'imp-zip' }, icono('icon-file-archive-o'), ' o fotos en .zip'), inZip))));

	// ---------- Paso 3: revisión ----------
	const resumen = h('div', { class: 'imp-resumen' });
	const avisos = h('div');
	const tbody = h('tbody');
	// Qué filas se suben: fila → sí/no. Sin elegir, todas menos las que parecen repetidas.
	const eleccion = new Map();
	const marcada = (it) => eleccion.get(it.fila) ?? !it.parecida;
	const seImporta = (it) => !it.errores.length && marcada(it);
	const marcarTodas = (si) => { for (const it of plan) if (!it.errores.length) eleccion.set(it.fila, si); dibujar(); };
	const selTodas = h('input', { class: 'form-check-input', type: 'checkbox', 'aria-label': 'Subir todas', onchange: (e) => marcarTodas(e.target.checked) });
	const btnTodas = h('button', { type: 'button', class: 'btn btn-sm btn-link d-md-none p-0', onclick: () => marcarTodas(!selTodas.checked) }, 'Seleccionar todas');
	const btnImportar = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => importar() }, 'Importar');
	const notaImportar = h('span', { class: 'small text-muted imp-nota' }, icono('icon-eye-slash'), ' Entran como borrador.');
	const paso2 = h('section', { class: 'card imp-paso', hidden: true }, h('div', { class: 'card-body' },
		h('div', { class: 'd-flex justify-content-between align-items-center gap-2 mb-3' },
			h('h2', { class: 'imp-paso-titulo mb-0' }, h('span', { class: 'imp-num' }, '2'), 'Elige qué subir'),
			btnTodas),
		resumen, avisos,
		cajaTabla(
			h('table', { class: 'table table-admin align-middle tabla-propiedades mb-0' },
				h('thead', {}, h('tr', {},
					h('th', { class: 'celda-sel' }, h('label', { class: 'sel-toque' }, selTodas)),
					[['Fila', 'celda-num'], ['Fotos', 'celda-foto'], ['Propiedad', 'celda-titulo'], ['Precio', 'celda-precio']].map(([t, c]) => h('th', { scope: 'col', class: c }, t)))),
				tbody), { tarjeta: true })));
	const acciones = h('div', { class: 'sticky-actions imp-acciones', hidden: true }, btnImportar, notaImportar);

	// ---------- Paso 3: progreso ----------
	const barra = h('div', { class: 'progress-bar', style: 'width:0%' });
	const progreso = h('div', { class: 'progress imp-progreso', role: 'progressbar', 'aria-label': 'Progreso de la importación', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, barra);
	const textoProgreso = h('p', { class: 'small mb-2', 'aria-live': 'polite' });
	const registro = h('ul', { class: 'imp-registro small' });
	const final = h('div');
	const tituloPaso3 = h('span', {}, 'Importando…');
	const paso3 = h('section', { class: 'card imp-paso', hidden: true }, h('div', { class: 'card-body' },
		h('h2', { class: 'imp-paso-titulo' }, h('span', { class: 'imp-num' }, '3'), tituloPaso3),
		textoProgreso, progreso, final, registro));

	mount(container, h('div', { class: 'imp-vista' },
		encabezado,
		paso1, paso2, acciones, paso3));

	// ---------- Lectura de archivos ----------
	inCsv.addEventListener('change', async () => {
		const f = inCsv.files[0];
		if (!f) return;
		try {
			const matriz = parseCsv(decodificarCsv(await f.arrayBuffer()));
			const { filas, desconocidas, indices } = filasComoObjetos(matriz);
			if (!('titulo' in indices)) throw new Error('El CSV no tiene la columna «titulo». Descarga la plantilla para ver los encabezados.');
			nombreCsv = f.name;
			filasCsv = { filas, desconocidas };
			eleccion.clear();
			estadoCsv.textContent = `${f.name}: ${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}.`;
			estadoCsv.classList.remove('text-danger');
			await revisar();
		} catch (err) {
			filasCsv = null;
			estadoCsv.textContent = err.message || errorMessage(err);
			estadoCsv.classList.add('text-danger');
			paso2.hidden = true; acciones.hidden = true;
		}
	});
	inCarpeta.addEventListener('change', async () => {
		const files = [...inCarpeta.files];
		if (!files.length) return;
		inZip.value = '';
		soltarVistas();
		fotos = files.map((f) => ({ ruta: f.webkitRelativePath || f.name, tipo: f.type, tamano: f.size, abrir: async () => f }));
		fuenteFotos = files[0].webkitRelativePath?.split('/')[0] || 'carpeta';
		estadoFotos.textContent = `Carpeta «${fuenteFotos}»: ${files.length} archivos.`;
		await revisar();
	});
	inZip.addEventListener('change', async () => {
		const f = inZip.files[0];
		if (!f) return;
		inCarpeta.value = '';
		try {
			const entradas = await leerZip(f);
			soltarVistas();
			fotos = entradas.map((e) => {
				const nombre = e.nombre.split('/').pop();
				return { ruta: e.nombre, tipo: '', tamano: e.tamano, abrir: async () => comoArchivo(await e.leer(), nombre), cifrado: e.cifrado };
			});
			fuenteFotos = f.name;
			estadoFotos.textContent = `${f.name}: ${entradas.length} archivos.`;
			estadoFotos.classList.remove('text-danger');
			await revisar();
		} catch (err) {
			fotos = [];
			estadoFotos.textContent = err.message;
			estadoFotos.classList.add('text-danger');
		}
	});

	// ---------- Revisión ----------
	let plan = [];
	async function revisar() {
		if (!filasCsv) return;
		const porCodigo = new Map(existentes.filter((p) => p.codigo).map((p) => [normalizarCodigo(p.codigo), p]));
		const usados = existentes.map((p) => p.codigo).filter(Boolean);
		const vistos = new Map();
		plan = filasCsv.filas.map((fila) => {
			const r = filaAPropiedad(fila, { opciones, agentes });
			const item = { fila: fila._fila, ...r, fotos: [], pequenas: 0, existente: null, parecida: null, generado: false };
			if (r.datos.codigo) {
				item.existente = porCodigo.get(r.datos.codigo) || null;
				if (vistos.has(r.datos.codigo)) item.errores.push(`Código repetido (también en la fila ${vistos.get(r.datos.codigo)})`);
				else vistos.set(r.datos.codigo, item.fila);
				usados.push(r.datos.codigo);
			}
			return item;
		});
		// Códigos generados, en orden y sin chocar con los existentes ni con los del CSV.
		for (const it of plan) {
			if (!it.datos.codigo && !it.errores.length) {
				it.datos.codigo = generarCodigo({ ...datosIniciales(), ...it.datos }, { agentes, codigos: usados });
				it.generado = true;
				usados.push(it.datos.codigo);
			}
		}
		// Sin código igual pero parecida a una del panel o a una fila anterior: se avisa y empieza sin marcar.
		const anteriores = [];
		for (const it of plan) {
			if (it.errores.length) continue;
			if (!it.existente) it.parecida = buscarParecida(it.datos, [...existentes, ...anteriores]);
			anteriores.push({ ...it.datos, _fila: it.fila });
		}
		grupos = agruparFotos(fotos, plan.map((it) => ({ claves: [it.carpeta, it.datos.codigo] })));
		plan.forEach((it, i) => { it.fotos = grupos.porFila.get(i) || []; });
		dibujar();
		// Tamaño de las fotos leyendo solo la cabecera (sin abrirlas completas cuando es carpeta).
		const todas = plan.filter((it) => !it.errores.length).flatMap((it) => it.fotos.map((f) => ({ it, f })));
		if (todas.length) {
			const sello = (revisar.sello = (revisar.sello || 0) + 1);
			await enParalelo(todas, 4, async ({ f }) => {
				if (sello !== revisar.sello || f.dim !== undefined) return;
				try {
					const blob = await f.abrir();
					f.dim = dimensionesDeCabecera(new Uint8Array(await blob.slice(0, 512 * 1024).arrayBuffer()));
				} catch { f.dim = null; }
			});
			if (sello !== revisar.sello) return;
			for (const it of plan) it.pequenas = it.fotos.filter((f) => f.dim && Math.max(f.dim.ancho, f.dim.alto) < FOTO_MINIMA).length;
			dibujar();
		}
	}

	// [color, ícono, texto, detalle] de cada fila.
	function estadoDeFila(it) {
		if (it.errores.length) return ['danger', 'icon-times-circle', 'Error', it.errores.join(' · ')];
		if (!marcada(it)) return ['secondary', 'icon-ban', 'No se sube', it.parecida ? repetidaDe(it) : ''];
		if (it.existente) return ['info', 'icon-refresh', 'Se actualiza', ''];
		if (it.parecida) return ['warning', 'icon-files-o', 'Parece repetida', repetidaDe(it)];
		if (!it.fotos.length) return ['warning', 'icon-camera', 'Sin fotos', ''];
		if (it.pequenas) return ['warning', 'icon-exclamation-triangle', plural(it.pequenas, 'foto pequeña', 'fotos pequeñas'), `Menos de ${FOTO_MINIMA} px: se verá borrosa.`];
		return ['success', 'icon-check-circle', 'Nueva', ''];
	}
	const repetidaDe = (it) => (it.parecida._fila ? `Igual a la fila ${it.parecida._fila}` : `Ya está en el panel${it.parecida.codigo ? ` como ${it.parecida.codigo}` : ''}`);
	// La primera foto de la fila, tal como quedará de portada. Se abre una sola vez por archivo.
	function miniatura(f) {
		if (!f) return h('span', { class: 'thumb thumb-vacia', title: 'Sin fotos' }, icono('icon-camera'));
		const img = h('img', { class: 'thumb', alt: '' });
		f.vista ??= f.abrir().then((b) => URL.createObjectURL(b), () => null); // si no abre, la subida lo avisa
		f.vista.then((url) => { if (url) img.src = url; });
		return img;
	}
	const soltarVistas = () => fotos.forEach((f) => f.vista?.then((url) => url && URL.revokeObjectURL(url)));

	const chip = (color, ic, texto) => badge([icono(ic), ` ${texto}`], color);

	let grupos = { sinFila: [], ignorados: 0 };
	function dibujar() {
		paso2.hidden = false;
		acciones.hidden = false;
		const n = (f) => plan.filter(f).length;
		const validas = plan.filter((it) => !it.errores.length);
		resumen.replaceChildren();
		mount(resumen,
			chip('success', 'icon-check-circle', plural(n((it) => !it.errores.length && !it.existente && !it.parecida), 'nueva', 'nuevas')),
			n((it) => it.existente) ? chip('info', 'icon-refresh', plural(n((it) => it.existente), 'ya existe', 'ya existen')) : null,
			n((it) => it.parecida) ? chip('warning', 'icon-files-o', plural(n((it) => it.parecida), 'parece repetida', 'parecen repetidas')) : null,
			n((it) => it.errores.length) ? chip('danger', 'icon-times-circle', `${n((it) => it.errores.length)} con error`) : null,
			chip('secondary', 'icon-picture-o', plural(plan.reduce((s, it) => s + (seImporta(it) ? it.fotos.length : 0), 0), 'foto', 'fotos')));

		const avisosLista = [];
		if (filasCsv.desconocidas.length) avisosLista.push(['info', `Columnas que no se usan: ${filasCsv.desconocidas.join(', ')}.`]);
		if (grupos.sinFila.length) {
			avisosLista.push(['warning', h('span', {}, 'Fotos sin fila en el CSV (no se suben): ',
				grupos.sinFila.map((g, i) => [i ? ', ' : '', h('strong', {}, g.nombre), ` (${g.fotos})`]), '.')]);
		}
		if (grupos.ignorados) avisosLista.push(['secondary', `${plural(grupos.ignorados, 'archivo no es imagen', 'archivos no son imágenes')}.`]);
		avisos.replaceChildren(...avisosLista.map(([c, t]) => h('div', { class: `alert alert-${c} imp-aviso` }, t)));

		tbody.replaceChildren(...plan.map((it) => {
			const [color, ic, texto, detalle] = estadoDeFila(it);
			const d = it.existente ? { ...it.existente, ...it.datos } : it.datos; // al actualizar, lo que no trae el CSV se queda
			const lugar = [d.zona, d.ciudad].filter(Boolean).join(', ');
			const datos = datosDe(d);
			return h('tr', {},
				h('td', { class: 'celda-sel' }, h('label', { class: 'sel-toque' }, h('input', {
					class: 'form-check-input', type: 'checkbox', checked: seImporta(it), disabled: !!it.errores.length || importando,
					'aria-label': `Subir ${d.titulo || `la fila ${it.fila}`}`,
					onchange: (e) => { eleccion.set(it.fila, e.target.checked); dibujar(); }
				}))),
				h('td', { class: 'celda-num' }, it.fila),
				h('td', { class: 'celda-foto' }, miniatura(it.fotos[0])),
				h('td', { class: 'celda-titulo' },
					d.codigo ? h('div', { class: 'prop-codigo' }, d.codigo) : null,
					h('div', { class: 'prop-chips' },
						chip(color, ic, texto), it.fotos.length ? chip('secondary', 'icon-picture-o', it.fotos.length) : null, detalle ? h('span', { class: `small ${color === 'danger' ? 'text-danger' : 'text-muted'}` }, detalle) : null),
					h('div', { class: 'fw-semibold prop-titulo' }, d.titulo || '(sin título)'),
					lugar ? h('div', { class: 'small text-muted prop-zona' }, icono('icon-map-marker'), ` ${lugar}`) : null,
					datos.length ? h('div', { class: 'prop-datos' }, datos) : null),
				h('td', { class: 'text-nowrap celda-precio' }, h('div', {}, formatPrice(d.precio, d.moneda, d.operacion))));
		}));
		const total = n(seImporta);
		selTodas.checked = !!validas.length && total === validas.length;
		selTodas.indeterminate = !!total && total < validas.length;
		selTodas.disabled = !validas.length || importando;
		btnTodas.textContent = selTodas.checked ? 'Quitar todas' : 'Seleccionar todas';
		btnImportar.disabled = !total || importando;
		btnImportar.replaceChildren(icono('icon-cloud-upload'), ` Importar ${total}`);
	}

	// ---------- Importación ----------
	const avisoSalir = (e) => { e.preventDefault(); e.returnValue = ''; };

	async function subirFotos(it, carpeta, hashesPrevios) {
		const hashes = new Set(hashesPrevios);
		const subidas = new Array(it.fotos.length).fill(null);
		const fallas = [];
		let repetidas = 0;
		await enParalelo(it.fotos, FOTOS_EN_PARALELO, async (f, k) => {
			const nombre = f.ruta.split('/').pop();
			try {
				const archivo = await f.abrir();
				const proc = await procesarImagen(archivo, undefined, undefined, { marca: true });
				if (hashes.has(proc.hash)) { repetidas++; return; }
				hashes.add(proc.hash);
				subidas[k] = { ...(await uploadImage(archivo, carpeta, proc)), alt: '' };
			} catch (err) {
				fallas.push(`${nombre}: ${err.message}`);
			}
		});
		return { fotos: subidas.filter(Boolean), fallas, repetidas };
	}

	// Si la propiedad no se guarda, sus fotos recién subidas se borran: no quedan huérfanas.
	async function guardar(escribir, fotosNuevas) {
		try {
			await escribir();
		} catch (err) {
			await Promise.all(fotosNuevas.map((f) => deleteImage(f.path)));
			throw err;
		}
	}

	function slugLibre(titulo, usados) {
		const base = slugify(titulo) || 'propiedad';
		let s = base, n = 2;
		while (usados.has(s)) s = `${base}-${n++}`;
		usados.add(s);
		return s;
	}

	async function importar() {
		const lista = plan.filter(seImporta);
		if (!lista.length || importando) return;
		importando = true;
		window.addEventListener('beforeunload', avisoSalir);
		[inCsv, inCarpeta, inZip, btnTodas].forEach((el) => { el.disabled = true; });
		dibujar();
		paso3.hidden = false;
		acciones.hidden = true;
		paso3.scrollIntoView({ behavior: 'smooth', block: 'start' });
		registro.replaceChildren();
		final.replaceChildren();
		const cuenta = { creadas: 0, actualizadas: 0, saltadas: plan.filter((it) => !it.errores.length && !marcada(it)).length, error: plan.filter((it) => it.errores.length).length };
		const slugs = new Set(existentes.map((p) => p.slug).filter(Boolean));
		const totalFotos = lista.reduce((s, it) => s + it.fotos.length, 0) || 1;
		let hechas = 0, fotosHechas = 0;
		const avanzar = (texto) => {
			const pct = Math.round(100 * (0.15 * hechas / lista.length + 0.85 * Math.min(1, fotosHechas / totalFotos)));
			const valor = hechas === lista.length ? 100 : pct;
			barra.style.width = `${valor}%`;
			progreso.setAttribute('aria-valuenow', String(valor));
			textoProgreso.textContent = texto;
		};
		const anotar = (clase, ic, texto, detalle) => registro.append(h('li', { class: `imp-log-${clase}` }, icono(ic), ' ', texto,
			detalle?.length ? h('ul', { class: 'text-muted' }, detalle.map((d) => h('li', {}, d))) : null));

		// Inglés al importar. Si el traductor falla, la fila no: se traduce sola al abrir Propiedades.
		const enIngles = (d) => (faltaIngles(d) ? traducirEn(d).catch(() => null) : null);
		for (const it of lista) {
			const titulo = it.datos.titulo;
			avanzar(`Importando ${hechas + 1} de ${lista.length}: ${titulo}`);
			try {
				if (it.existente) {
					const p = it.existente;
					const pref = doc(db, 'properties', p.id);
					const vac = await prepararVacacional(p.id, it, p);
					const r = await subirFotos(it, `properties/${p.id}`, (p.fotos || []).map((f) => f.hash).filter(Boolean));
					fotosHechas += it.fotos.length;
					const cambios = { ...it.datos, ...(vac ? vac.pub : {}), updatedAt: serverTimestamp(), updatedBy: session.user.uid };
					delete cambios.codigo;
					if (cambios.estado && estadoDe(p).valor !== cambios.estado) {
						cambios.estadoFecha = serverTimestamp();
						cambios.historialEstado = [...(p.historialEstado || []), entradaHistorial(cambios.estado)];
					}
					const precio = Number(cambios.precio) || 0;
					const moneda = cambios.moneda || p.moneda || 'USD';
					const ultimo = (p.historialPrecio || []).at(-1);
					if (precio && (!ultimo || Number(ultimo.precio) !== precio || ultimo.moneda !== moneda)) {
						cambios.historialPrecio = [...(p.historialPrecio || []), { precio, moneda, fecha: Timestamp.now() }];
					}
					if (r.fotos.length) cambios.fotos = [...(p.fotos || []), ...r.fotos];
					const en = await enIngles({ ...p, ...cambios });
					if (en) cambios.en = en;
					await guardar(() => updateDoc(pref, cambios), r.fotos);
					await guardarSocio(vac);
					Object.assign(p, cambios);
					cuenta.actualizadas++;
					anotar('ok', 'icon-refresh', `Actualizada: ${it.datos.codigo} · ${titulo} (${r.fotos.length} ${r.fotos.length === 1 ? 'foto nueva' : 'fotos nuevas'}${r.repetidas ? `, ${r.repetidas} ya ${r.repetidas === 1 ? 'estaba' : 'estaban'}` : ''})`, r.fallas);
				} else {
					const nref = doc(collection(db, 'properties'));
					const vac = await prepararVacacional(nref.id, it);
					const r = await subirFotos(it, `properties/${nref.id}`, []);
					fotosHechas += it.fotos.length;
					const d = { ...datosIniciales(), agentId: '', descripcion: '', ...it.datos, ...(vac ? vac.pub : {}) };
					d.publicado = false;
					d.slug = slugLibre(titulo, slugs);
					const en = await enIngles(d);
					if (en) d.en = en;
					d.estado = estadoDe(d).valor;
					d.estadoFecha = serverTimestamp();
					d.historialEstado = [entradaHistorial(d.estado)];
					d.historialPrecio = Number(d.precio) ? [{ precio: Number(d.precio), moneda: d.moneda || 'USD', fecha: Timestamp.now() }] : [];
					d.fotos = r.fotos;
					d.createdAt = serverTimestamp();
					d.createdBy = session.user.uid;
					d.updatedAt = serverTimestamp();
					d.updatedBy = session.user.uid;
					await guardar(() => setDoc(nref, d), r.fotos);
					existentes.push({ id: nref.id, ...d });
					cuenta.creadas++;
					anotar('ok', 'icon-check-circle', `Creada: ${d.codigo} · ${titulo} (${r.fotos.length} ${r.fotos.length === 1 ? 'foto' : 'fotos'})`, r.fallas);
				}
			} catch (err) {
				cuenta.error++;
				anotar('error', 'icon-times-circle', `Error en la fila ${it.fila} (${titulo}): ${errorMessage(err)}`);
			}
			hechas++;
			avanzar(`Importando ${Math.min(hechas + 1, lista.length)} de ${lista.length}…`);
		}

		const cambiadas = cuenta.creadas + cuenta.actualizadas;
		if (cambiadas) {
			try { await markPending(`Importación de ${cambiadas} propiedades`); } catch (err) { console.warn(err); }
		}
		window.removeEventListener('beforeunload', avisoSalir);
		importando = false;
		avanzar('');
		textoProgreso.hidden = true;
		tituloPaso3.textContent = 'Importación terminada';
		progreso.classList.add('imp-progreso-fin');
		const dato = (n, t, clase) => h('div', { class: `imp-dato imp-tono-${clase}` }, h('strong', {}, String(n)), h('span', {}, t));
		final.replaceChildren(
			h('div', { class: 'imp-datos' },
				dato(cuenta.creadas, cuenta.creadas === 1 ? 'creada' : 'creadas', 'success'),
				dato(cuenta.actualizadas, cuenta.actualizadas === 1 ? 'actualizada' : 'actualizadas', 'info'),
				dato(cuenta.saltadas, cuenta.saltadas === 1 ? 'saltada' : 'saltadas', 'muted'),
				dato(cuenta.error, 'con error', cuenta.error ? 'danger' : 'muted')),
			h('p', { class: 'small text-muted' }, cambiadas
				? 'Las nuevas quedaron como borrador (no visibles). Revísalas, enciende «Visible en la página» y publica.'
				: 'No se guardó ninguna propiedad.'),
			h('div', { class: 'd-flex flex-wrap gap-2 mb-3' },
				h('a', { href: '#/propiedades', class: 'btn btn-primary' }, 'Ver propiedades'),
				h('button', { type: 'button', class: 'btn btn-light', onclick: () => { render(container); window.scrollTo(0, 0); } }, 'Importar otro archivo')));
		toast(cambiadas ? `Importación lista: ${cuenta.creadas} creadas, ${cuenta.actualizadas} actualizadas.` : 'No se importó ninguna propiedad.', cuenta.error ? 'warning' : undefined);
	}
}

