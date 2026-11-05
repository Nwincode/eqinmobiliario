// Importación masiva de propiedades desde un CSV con sus fotos (carpeta o .zip). Solo administradores.
// Ruta: #/propiedades/importar. Nada se guarda hasta pulsar «Importar N propiedades».
import { db, doc, collection, setDoc, updateDoc, serverTimestamp, Timestamp } from '../firebase.js';
import { h, mount, toast, errorMessage, pageHeader, downloadCsv, slugify } from '../ui.js';
import { uploadImage, procesarImagen, deleteImage } from '../form.js';
import { session, loadAgents, markPending } from '../session.js';
import { estadoDe } from '../estados.js';
import { OPERACIONES, TIPOS, ESTADOS, MONEDAS, datosIniciales, entradaHistorial, loadAll } from './properties.js';
import {
	decodificarCsv, parseCsv, filasComoObjetos, filaAPropiedad, generarCodigo, normalizarCodigo,
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

export async function render(container) {
	container.replaceChildren();
	if (!session.isAdmin) {
		mount(container, pageHeader('Importar propiedades', h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver')),
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

	// ---------- Paso 1: plantilla ----------
	const paso1 = h('section', { class: 'card imp-paso' }, h('div', { class: 'card-body' },
		h('h2', { class: 'imp-paso-titulo' }, h('span', { class: 'imp-num' }, '1'), 'Prepara el CSV'),
		h('p', { class: 'mb-2' }, 'Una fila por propiedad. Puedes llenarlo en Excel o Google Sheets y guardarlo como CSV.'),
		h('ul', { class: 'imp-lista small text-muted mb-3' },
			h('li', {}, 'La única columna obligatoria es ', h('strong', {}, 'titulo'), '. Las demás son opcionales y pueden ir en cualquier orden.'),
			h('li', {}, 'Si dejas ', h('strong', {}, 'codigo'), ' vacío, se crea solo (condominio, zona, asesor y número). Si pones un código que ya existe, puedes actualizar esa propiedad.'),
			h('li', {}, 'En ', h('strong', {}, 'carpeta'), ' escribe el nombre de la carpeta con sus fotos. También puedes nombrar cada foto con el código: ', h('code', {}, 'CODIGO-1.jpg'), '.'),
			h('li', {}, 'Separa las ', h('strong', {}, 'amenidades'), ' con ', h('code', {}, ';'), ' o ', h('code', {}, '|'), '. En operación, tipo, estado y moneda puedes escribir la palabra: «Venta», «Quetzales»…')),
		h('button', { type: 'button', class: 'btn btn-outline-primary', onclick: () => downloadCsv('plantilla-propiedades.csv', PLANTILLA) },
			icono('icon-download'), ' Descargar plantilla')));

	// ---------- Paso 2: archivos ----------
	const inCsv = h('input', { type: 'file', class: 'form-control', id: 'imp-csv', accept: '.csv,text/csv' });
	const inCarpeta = h('input', { type: 'file', class: 'form-control', id: 'imp-carpeta', multiple: true, webkitdirectory: '', directory: '' });
	const inZip = h('input', { type: 'file', class: 'form-control', id: 'imp-zip', accept: '.zip,application/zip' });
	const estadoCsv = h('div', { class: 'form-text', 'aria-live': 'polite' });
	const estadoFotos = h('div', { class: 'form-text', 'aria-live': 'polite' }, 'Opcional. Dentro, una carpeta por propiedad.');
	const paso2 = h('section', { class: 'card imp-paso' }, h('div', { class: 'card-body' },
		h('h2', { class: 'imp-paso-titulo' }, h('span', { class: 'imp-num' }, '2'), 'Elige los archivos'),
		h('div', { class: 'row g-3' },
			h('div', { class: 'col-12 col-lg-4' },
				h('label', { class: 'form-label', for: 'imp-csv' }, icono('icon-file-excel-o'), ' Archivo CSV *'), inCsv, estadoCsv),
			h('div', { class: 'col-12 col-lg-4' },
				h('label', { class: 'form-label', for: 'imp-carpeta' }, icono('icon-folder-open'), ' Carpeta de fotos'), inCarpeta, estadoFotos),
			h('div', { class: 'col-12 col-lg-4' },
				h('label', { class: 'form-label', for: 'imp-zip' }, icono('icon-file-archive-o'), ' O un archivo .zip con las fotos'), inZip,
				h('div', { class: 'form-text' }, 'Dentro del .zip, una carpeta por propiedad.')))));

	// ---------- Paso 3: revisión ----------
	const resumen = h('div', { class: 'imp-resumen' });
	const avisos = h('div');
	const tbody = h('tbody');
	const selGlobal = h('select', { class: 'form-select form-select-sm', id: 'imp-existentes' },
		h('option', { value: 'actualizar' }, 'Actualizarlas'), h('option', { value: 'saltar' }, 'Saltarlas'));
	const filtroGlobal = h('div', { class: 'imp-global' },
		h('label', { class: 'form-label small mb-0', for: 'imp-existentes' }, 'Si el código ya existe:'), selGlobal);
	const btnImportar = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => importar() }, 'Importar');
	const notaImportar = h('span', { class: 'small text-muted imp-nota' }, 'Entran como borrador: no se ven en la página hasta que las publiques. Nada se guarda hasta que pulses el botón.');
	const paso3 = h('section', { class: 'card imp-paso', hidden: true }, h('div', { class: 'card-body' },
		h('div', { class: 'd-flex flex-wrap justify-content-between align-items-end gap-2 mb-3' },
			h('h2', { class: 'imp-paso-titulo mb-0' }, h('span', { class: 'imp-num' }, '3'), 'Revisa antes de importar'),
			filtroGlobal),
		resumen, avisos,
		h('div', { class: 'table-responsive imp-tabla-wrap' },
			h('table', { class: 'table table-admin align-middle tabla-importar mb-0' },
				h('thead', {}, h('tr', {}, ['Fila', 'Código', 'Propiedad', 'Fotos', 'Estado', 'Acción'].map((t) => h('th', { scope: 'col' }, t)))),
				tbody))));
	const acciones = h('div', { class: 'sticky-actions imp-acciones', hidden: true }, btnImportar, notaImportar);

	// ---------- Paso 4: progreso ----------
	const barra = h('div', { class: 'progress-bar', style: 'width:0%' });
	const progreso = h('div', { class: 'progress imp-progreso', role: 'progressbar', 'aria-label': 'Progreso de la importación', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, barra);
	const textoProgreso = h('p', { class: 'small mb-2', 'aria-live': 'polite' });
	const registro = h('ul', { class: 'imp-registro small' });
	const final = h('div');
	const tituloPaso4 = h('span', {}, 'Importando…');
	const paso4 = h('section', { class: 'card imp-paso', hidden: true }, h('div', { class: 'card-body' },
		h('h2', { class: 'imp-paso-titulo' }, h('span', { class: 'imp-num' }, '4'), tituloPaso4),
		textoProgreso, progreso, final, registro));

	mount(container, h('div', { class: 'imp-vista' },
		pageHeader('Importar propiedades', h('a', { href: '#/propiedades', class: 'btn btn-light' }, 'Volver a propiedades')),
		h('p', { class: 'imp-intro' }, 'Sube varias propiedades a la vez desde una hoja de cálculo, con sus fotos. No tienes que preparar las fotos: se enderezan y se optimizan solas para que la página cargue rápido.'),
		paso1, paso2, paso3, acciones, paso4));

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
			estadoCsv.textContent = `${f.name}: ${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}.`;
			estadoCsv.classList.remove('text-danger');
			await revisar();
		} catch (err) {
			filasCsv = null;
			estadoCsv.textContent = err.message || errorMessage(err);
			estadoCsv.classList.add('text-danger');
			paso3.hidden = true; acciones.hidden = true;
		}
	});
	inCarpeta.addEventListener('change', async () => {
		const files = [...inCarpeta.files];
		if (!files.length) return;
		inZip.value = '';
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
			const item = { fila: fila._fila, ...r, fotos: [], pequenas: 0, existente: null, accion: '', generado: false };
			if (r.datos.codigo) {
				item.existente = porCodigo.get(r.datos.codigo) || null;
				if (vistos.has(r.datos.codigo)) item.errores.push(`Código repetido (también en la fila ${vistos.get(r.datos.codigo)})`);
			}
			return item;
		});
		// Códigos generados, en orden y sin chocar con los existentes ni con los del CSV.
		for (const it of plan) if (it.datos.codigo) { usados.push(it.datos.codigo); if (!vistos.has(it.datos.codigo)) vistos.set(it.datos.codigo, it.fila); }
		for (const it of plan) {
			if (!it.datos.codigo && !it.errores.length) {
				it.datos.codigo = generarCodigo({ ...datosIniciales(), ...it.datos }, { agentes, codigos: usados });
				it.generado = true;
				usados.push(it.datos.codigo);
			}
			if (it.existente) it.accion = selGlobal.value;
		}
		const grupos = agruparFotos(fotos, plan.map((it) => ({ claves: [it.carpeta, it.datos.codigo] })));
		plan.forEach((it, i) => { it.fotos = grupos.porFila.get(i) || []; });
		dibujar(grupos);
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
			dibujar(grupos);
		}
	}

	function estadoDeFila(it) {
		if (it.errores.length) return { clase: 'danger', icono: 'icon-times-circle', texto: 'Error' };
		if (it.existente) return it.accion === 'saltar'
			? { clase: 'secondary', icono: 'icon-ban', texto: 'Ya existe: se salta' }
			: { clase: 'info', icono: 'icon-refresh', texto: 'Ya existe: se actualiza' };
		if (!it.fotos.length) return { clase: 'warning', icono: 'icon-camera', texto: 'Sin fotos' };
		if (it.pequenas) return { clase: 'warning', icono: 'icon-exclamation-triangle', texto: `${it.pequenas} ${it.pequenas === 1 ? 'foto pequeña' : 'fotos pequeñas'}` };
		return { clase: 'success', icono: 'icon-check-circle', texto: 'Lista' };
	}
	const seImporta = (it) => !it.errores.length && !(it.existente && it.accion === 'saltar');

	function dibujar(grupos) {
		paso3.hidden = false;
		acciones.hidden = false;
		const n = (f) => plan.filter(f).length;
		const chip = (clase, ic, texto) => h('span', { class: `imp-chip imp-tono-${clase}` }, icono(ic), ' ', texto);
		resumen.replaceChildren(
			chip('success', 'icon-check-circle', plural(n((it) => !it.errores.length && !it.existente), 'nueva', 'nuevas')),
			n((it) => it.existente) ? chip('info', 'icon-refresh', plural(n((it) => it.existente), 'ya existe', 'ya existen')) : null,
			n((it) => it.errores.length) ? chip('danger', 'icon-times-circle', `${n((it) => it.errores.length)} con error`) : null,
			n((it) => !it.errores.length && !it.fotos.length) ? chip('warning', 'icon-camera', `${n((it) => !it.errores.length && !it.fotos.length)} sin fotos`) : null,
			chip('muted', 'icon-picture-o', plural(plan.reduce((s, it) => s + (seImporta(it) ? it.fotos.length : 0), 0), 'foto a subir', 'fotos a subir')));
		filtroGlobal.hidden = !plan.some((it) => it.existente);

		const avisosLista = [];
		if (filasCsv.desconocidas.length) avisosLista.push(['info', `Columnas que no se usan: ${filasCsv.desconocidas.join(', ')}.`]);
		if (!fotos.length) avisosLista.push(['info', 'No elegiste fotos. Puedes importar sin fotos y agregarlas después en cada propiedad.']);
		if (grupos.sinFila.length) {
			avisosLista.push(['warning', h('span', {}, 'Estas fotos no coinciden con ninguna fila del CSV y no se suben: ',
				grupos.sinFila.map((g, i) => [i ? ', ' : '', h('strong', {}, g.nombre), ` (${plural(g.fotos, 'foto', 'fotos')})`]), '.')]);
		}
		if (grupos.ignorados) avisosLista.push(['secondary', `${grupos.ignorados} ${grupos.ignorados === 1 ? 'archivo no es imagen y se ignora' : 'archivos no son imágenes y se ignoran'}.`]);
		avisos.replaceChildren(...avisosLista.map(([c, t]) => h('div', { class: `alert alert-${c} imp-aviso` }, t)));

		tbody.replaceChildren(...plan.map((it) => {
			const e = estadoDeFila(it);
			let accion = h('span', { class: 'text-muted small' }, it.errores.length ? 'No se importa' : 'Crear');
			if (it.existente && !it.errores.length) {
				accion = h('select', { class: 'form-select form-select-sm', 'aria-label': `Qué hacer con ${it.datos.codigo}` },
					h('option', { value: 'actualizar', selected: it.accion === 'actualizar' }, 'Actualizar'),
					h('option', { value: 'saltar', selected: it.accion === 'saltar' }, 'Saltar'));
				accion.addEventListener('change', () => { it.accion = accion.value; dibujar(grupos); });
			}
			return h('tr', { class: it.errores.length ? 'imp-fila-error' : '' },
				h('td', { class: 'imp-c-fila text-muted small' }, h('span', { class: 'd-md-none' }, 'Fila '), it.fila),
				h('td', { class: 'imp-c-codigo' }, h('code', {}, it.datos.codigo || '—'), it.generado ? h('div', { class: 'small text-muted' }, 'código nuevo') : null),
				h('td', { class: 'imp-c-titulo' },
					h('div', { class: 'fw-semibold' }, it.datos.titulo || '(sin título)'),
					it.existente ? h('div', { class: 'small text-muted' }, `En el panel: ${it.existente.titulo || it.existente.id}`) : null,
					!it.errores.length && it.pequenas ? h('div', { class: 'small text-muted' }, `${it.pequenas === 1 ? 'Una foto mide' : `${it.pequenas} fotos miden`} menos de ${FOTO_MINIMA} px y puede${it.pequenas === 1 ? '' : 'n'} verse borrosa${it.pequenas === 1 ? '' : 's'}.`) : null,
				it.errores.length ? h('ul', { class: 'imp-errores small' }, it.errores.map((x) => h('li', {}, x))) : null),
				h('td', { class: 'imp-c-fotos text-nowrap' }, icono('icon-picture-o'), ` ${it.fotos.length}`, h('span', { class: 'visually-hidden' }, ' fotos')),
				h('td', { class: 'imp-c-estado' }, h('span', { class: `imp-badge imp-tono-${e.clase}` }, icono(e.icono), ' ', e.texto)),
				h('td', { class: 'imp-c-accion' }, accion));
		}));
		const total = plan.filter(seImporta).length;
		btnImportar.disabled = !total || importando;
		btnImportar.replaceChildren(icono('icon-cloud-upload'), ` Importar ${total} ${total === 1 ? 'propiedad' : 'propiedades'}`);
	}
	selGlobal.addEventListener('change', () => {
		for (const it of plan) if (it.existente) it.accion = selGlobal.value;
		dibujar(agruparFotos(fotos, plan.map((it) => ({ claves: [it.carpeta, it.datos.codigo] }))));
	});

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
				const proc = await procesarImagen(archivo);
				if (hashes.has(proc.hash)) { repetidas++; return; }
				hashes.add(proc.hash);
				subidas[k] = { ...(await uploadImage(archivo, carpeta, proc)), alt: '' };
			} catch (err) {
				fallas.push(`${nombre}: ${err.message}`);
			}
		});
		return { fotos: subidas.filter(Boolean), fallas, repetidas };
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
		[inCsv, inCarpeta, inZip, selGlobal, btnImportar].forEach((el) => { el.disabled = true; });
		tbody.querySelectorAll('select').forEach((el) => { el.disabled = true; });
		paso4.hidden = false;
		acciones.hidden = true;
		paso4.scrollIntoView({ behavior: 'smooth', block: 'start' });
		registro.replaceChildren();
		final.replaceChildren();
		const cuenta = { creadas: 0, actualizadas: 0, saltadas: plan.filter((it) => it.existente && it.accion === 'saltar' && !it.errores.length).length, error: plan.filter((it) => it.errores.length).length };
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

		for (const it of lista) {
			const titulo = it.datos.titulo;
			avanzar(`Importando ${hechas + 1} de ${lista.length}: ${titulo}`);
			try {
				if (it.existente) {
					const p = it.existente;
					const pref = doc(db, 'properties', p.id);
					const r = await subirFotos(it, `properties/${p.id}`, (p.fotos || []).map((f) => f.hash).filter(Boolean));
					fotosHechas += it.fotos.length;
					const cambios = { ...it.datos, updatedAt: serverTimestamp(), updatedBy: session.user.uid };
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
					await updateDoc(pref, cambios);
					Object.assign(p, cambios);
					cuenta.actualizadas++;
					anotar('ok', 'icon-refresh', `Actualizada: ${it.datos.codigo} · ${titulo} (${r.fotos.length} ${r.fotos.length === 1 ? 'foto nueva' : 'fotos nuevas'}${r.repetidas ? `, ${r.repetidas} ya ${r.repetidas === 1 ? 'estaba' : 'estaban'}` : ''})`, r.fallas);
				} else {
					const nref = doc(collection(db, 'properties'));
					const r = await subirFotos(it, `properties/${nref.id}`, []);
					fotosHechas += it.fotos.length;
					const d = { ...datosIniciales(), agentId: '', descripcion: '', ...it.datos };
					d.publicado = false;
					d.slug = slugLibre(titulo, slugs);
					d.estado = estadoDe(d).valor;
					d.estadoFecha = serverTimestamp();
					d.historialEstado = [entradaHistorial(d.estado)];
					d.historialPrecio = Number(d.precio) ? [{ precio: Number(d.precio), moneda: d.moneda || 'USD', fecha: Timestamp.now() }] : [];
					d.fotos = r.fotos;
					d.createdAt = serverTimestamp();
					d.createdBy = session.user.uid;
					d.updatedAt = serverTimestamp();
					d.updatedBy = session.user.uid;
					try {
						await setDoc(nref, d);
					} catch (err) {
						await Promise.all(r.fotos.map((f) => deleteImage(f.path))); // no dejar fotos huérfanas
						throw err;
					}
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
		tituloPaso4.textContent = 'Importación terminada';
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

