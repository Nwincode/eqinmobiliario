// Pantallas de los permisos del socio (diseño aprobado: «Permisos del socio»):
//   1. Propietarios: tarjeta «Todos los socios pueden cambiar» (tarjetaGlobal).
//   2. Ficha del socio, junto a su acceso al panel: «Qué puede cambiar» (bloqueSocio).
//   3. Panel del socio: el aviso de por qué no puede cambiar algo (avisoSocio) y qué apagar (permisosDelSocio).
// La cuenta: admin/js/permisos-socio.js. Lo que se guarda: admin/js/permisos-panel.js.
import { db, doc, getDoc } from './firebase.js';
import { h, toast, showError, badge, dia } from './ui.js';
import { dineroPorMoneda } from './formato.js';
import { PERMISOS, DIAS_CORTE, puede } from './permisos-socio.js';
import { leerGlobal, guardarGlobal, guardarPropios, recalcularPermisosDe } from './permisos-panel.js';

const EMPRESA = 'Equipo Inmobiliario';
const montos = (deuda) => dineroPorMoneda(deuda.porMoneda, ' y ');
const hace = (n) => (n === 1 ? 'hace 1 día' : `hace ${n} días`);

function interruptor(icono, texto, marcado, { disabled = false, onchange } = {}) {
	const input = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', checked: marcado, disabled, onchange });
	return h('label', { class: 'perm-sw' }, h('span', { class: 'form-check form-switch m-0' }, input), h('span', { class: icono, 'aria-hidden': 'true' }), texto);
}

// 1. Para todos los socios (solo el administrador).
export function tarjetaGlobal() {
	const fila = h('div', { class: 'perm-fila' });
	const card = h('div', { class: 'card perm-global mb-3' }, h('div', { class: 'card-body' },
		h('strong', {}, 'Todos los socios pueden cambiar'),
		fila,
		h('p', { class: 'perm-nota' }, h('span', { class: 'icon-clock-o', 'aria-hidden': 'true' }),
			` A quien deba a ${EMPRESA} más de ${DIAS_CORTE} días se le apagan solos y se encienden al pagar. En la ficha de cada socio puedes cambiarlo solo para él.`)));
	leerGlobal().then((g) => {
		fila.replaceChildren(...PERMISOS.map(([k, texto, icono]) => interruptor(icono, texto, g[k] !== false, {
			onchange: async (e) => {
				const input = e.currentTarget;
				input.disabled = true;
				try {
					// Solo falla si no se guardó; el recálculo de cada socio que falle se hace en la próxima hora.
					const pendientes = await guardarGlobal({ [k]: input.checked });
					toast(input.checked ? `Todos los socios pueden cambiar: ${texto.toLowerCase()}.` : `Apagado para todos los socios: ${texto.toLowerCase()}.`);
					if (pendientes) toast('Algunos socios se ponen al día en la próxima hora.', 'warning');
				} catch (err) { input.checked = !input.checked; showError(err); }
				finally { input.disabled = false; }
			}
		})));
	}).catch(showError);
	return card;
}

// 2. Solo para un socio (en su ficha).
// `solo`: las claves que se muestran (quien no tiene casas por noche: solo «Ingresar inmuebles»).
export function bloqueSocio(prop, { solo = null } = {}) {
	const lista = PERMISOS.filter(([k]) => !solo || solo.includes(k));
	const caja = h('div', { class: 'perm-bloque' });
	const pintar = (r) => {
		if (!r) return caja.replaceChildren();
		const { permisos, deuda, propio, global } = r;
		const paraTodos = (k) => global?.[k] === false;
		const cortado = permisos.motivo === 'atraso';
		const cambiar = (k) => async (e) => {
			const input = e.currentTarget;
			input.disabled = true;
			try { pintar(await guardarPropios(prop.id, { [k]: input.checked })); }
			catch (err) { input.checked = !input.checked; input.disabled = false; showError(err); }
		};
		const etiqueta = cortado ? badge('Apagado por atraso', 'danger') : permisos.devuelto ? badge('Devueltos hasta que pague', 'warning') : null;
		const nota = deuda
			? `Debe a ${EMPRESA} ${montos(deuda)}; venció el ${dia(deuda.vence)} (${hace(deuda.dias)}). `
				+ (cortado ? `Se apagaron solos a los ${DIAS_CORTE} días y se encienden solos cuando registres su pago. `
					: permisos.devuelto ? 'Se los devolviste hasta que pague; al registrar su pago, todo vuelve a la normalidad. '
						: `Si pasan ${DIAS_CORTE} días se apagan solos. `)
				+ 'Solicitudes y chat siguen activos.'
			: `Si debe a ${EMPRESA} más de ${DIAS_CORTE} días, se apagan solos y se encienden al pagar. Solicitudes y chat siempre siguen activos.`;
		caja.replaceChildren(
			h('div', { class: 'perm-tit' }, h('strong', {}, 'Qué puede cambiar'), etiqueta),
			h('div', { class: 'perm-fila' }, lista.map(([k, texto, icono]) => interruptor(icono, paraTodos(k) ? `${texto} (apagado para todos)` : texto,
				cortado || paraTodos(k) ? false : propio[k] !== false, { disabled: cortado || paraTodos(k), onchange: cambiar(k) }))),
			h('p', { class: 'perm-nota' }, h('span', { class: 'icon-clock-o', 'aria-hidden': 'true' }), ` ${nota}`),
			cortado ? h('div', {}, h('button', {
				type: 'button', class: 'btn btn-outline-primary btn-sm perm-btn',
				onclick: async (e) => {
					e.currentTarget.disabled = true;
					try { pintar(await guardarPropios(prop.id, { devolver: true })); toast('Permisos devueltos hasta que pague.'); } catch (err) { showError(err); e.currentTarget.disabled = false; }
				}
			}, h('span', { class: 'icon-unlock', 'aria-hidden': 'true' }), ' Devolver permisos hasta que pague')) : null);
	};
	recalcularPermisosDe(prop.id).then(pintar).catch(showError);
	return caja;
}

// 3. Lo que puede el socio que está en el panel (null = todo).
export async function permisosDelSocio(propietarioId) {
	if (!propietarioId) return null;
	try {
		const s = await getDoc(doc(db, 'permisosSocios', propietarioId));
		return s.exists() ? s.data() : null;
	} catch { return null; }
}

// Aviso arriba de su panel cuando algo está apagado (por atraso, o porque el administrador lo apagó).
export function avisoSocio(p) {
	if (!p || PERMISOS.every(([k]) => puede(p, k))) return null;
	const apagados = PERMISOS.filter(([k]) => !puede(p, k)).map(([k]) => ({ precios: 'Precios', fechas: 'fechas', casa: '«La casa»', inmuebles: 'ingresar inmuebles' })[k]);
	// «y», o «e» antes de «i» («fechas e ingresar inmuebles»).
	const lista = apagados.length > 1 ? `${apagados.slice(0, -1).join(', ')} ${/^i/i.test(apagados.at(-1)) ? 'e' : 'y'} ${apagados.at(-1)}` : apagados[0];
	const verbo = apagados.length > 1 ? 'quedan' : 'queda';
	if (p.motivo === 'atraso' && p.deuda) {
		return h('div', { class: 'alert alert-danger perm-aviso', role: 'alert' },
			h('span', { class: 'icon-lock', 'aria-hidden': 'true' }),
			h('div', {}, h('strong', {}, `Debes ${montos(p.deuda)} a ${EMPRESA}; venció el ${dia(p.deuda.vence)}.`),
				` ${lista[0].toUpperCase()}${lista.slice(1)} ${verbo} en pausa y se reactivan cuando el equipo confirme tu pago. Las solicitudes y el chat siguen igual.`),
			h('a', { class: 'btn btn-danger btn-sm', href: '#/solicitudes' }, 'Subir comprobante'));
	}
	return h('div', { class: 'alert alert-secondary perm-aviso', role: 'status' },
		h('span', { class: 'icon-lock', 'aria-hidden': 'true' }),
		h('div', {}, `${lista[0].toUpperCase()}${lista.slice(1)} ${verbo} a cargo de ${EMPRESA} por ahora. Si quieres cambiar algo, escríbenos. Las solicitudes y el chat siguen igual.`));
}
