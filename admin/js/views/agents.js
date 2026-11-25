import { h, badge, elegirOpcion, toast, confirmDialog } from '../ui.js';
import { crudView } from '../crud.js';
import { invalidateAgents, markPending } from '../session.js';
import { db, collection, getDocs, query, where, writeBatch, doc } from '../firebase.js';
import { plural } from '../formato.js';

// Un asesor que se elimina no deja casas ni leads sin nadie: los leads de sus casas seguirían llegando con su agentId y
// «Sin asignar» no los mostraría. Antes, todo lo que lleva su agentId pasa a otro asesor («Reasignar»). Ocultarlo solo
// lo quita del sitio: su trabajo se queda con él.
const CON_ASESOR = ['properties', 'leads', 'clientes', 'requerimientos', 'actividades', 'propietarios', 'cotizaciones', 'reservas'];
// Sus usuarios del panel (entran como este asesor).
const usuariosDe = async (id) => (await getDocs(query(collection(db, 'users'), where('agentId', '==', id)))).docs.map((u) => u.data().email || u.id);
async function reasignarAntesDeEliminar(asesor, id) {
	const snaps = await Promise.all(CON_ASESOR.map((c) => getDocs(query(collection(db, c), where('agentId', '==', id)))));
	const casas = snaps[0].size, leads = snaps[1].size, total = snaps.reduce((n, s) => n + s.size, 0);
	if (!total) return true;
	const otros = (await getDocs(collection(db, 'agents'))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.id !== id && a.activo !== false);
	const tiene = [casas && plural(casas, 'casa', 'casas'), leads && plural(leads, 'lead', 'leads'), total - casas - leads && plural(total - casas - leads, 'registro más', 'registros más')].filter(Boolean).join(', ');
	if (!otros.length) {
		toast(`${asesor.nombre || 'Este asesor'} tiene ${tiene}. Crea o muestra otro asesor para pasárselos antes de eliminarlo.`, 'warning');
		return false;
	}
	// Se elige por id: dos asesores con el mismo nombre se distinguen por su correo (o su id).
	const repetido = (a) => otros.filter((b) => (b.nombre || '') === (a.nombre || '')).length > 1;
	const opciones = otros.map((a) => ({ id: a.id, texto: repetido(a) || !a.nombre ? `${a.nombre || 'Sin nombre'} (${a.email || a.id})` : a.nombre }));
	const elegido = await elegirOpcion(`${asesor.nombre || 'Este asesor'} tiene ${tiene}. Reasígnalos a otro asesor para eliminarlo:`, opciones.map((o) => o.texto));
	const nuevo = otros.find((a) => a.id === opciones.find((o) => o.texto === elegido)?.id);
	if (!nuevo || !(await confirmDialog(`¿Pasar ${tiene} a ${nuevo.nombre || nuevo.id} y eliminar a ${asesor.nombre || 'este asesor'}?`, { okText: 'Reasignar', danger: false }))) return false;
	const refs = snaps.flatMap((s, i) => s.docs.map((d) => doc(db, CON_ASESOR[i], d.id)));
	for (let i = 0; i < refs.length; i += 400) {
		const lote = writeBatch(db);
		for (const r of refs.slice(i, i + 400)) lote.update(r, { agentId: nuevo.id });
		await lote.commit();
	}
	if (casas) await markPending(`Casas de ${asesor.nombre} pasadas a ${nuevo.nombre}`);
	toast(`Reasignados a ${nuevo.nombre || nuevo.id}.`);
	return true;
}
import { revisar, chipFaltan } from '../pendientes.js';

export const render = crudView({
	collection: 'agents',
	route: 'asesores',
	pendientes: 'asesores',
	title: 'Asesores',
	singular: 'Asesor',
	intro: 'El equipo que aparece en la portada y en cada propiedad. Para que un asesor entre al panel, crea su usuario en "Usuarios" y vincúlalo aquí.',
	defaults: { activo: true, cargo: 'Agente de Bienes Raíces' },
	columns: [
		['', (a) => h('img', { class: 'avatar', src: a.foto || '', alt: '' })],
		['Nombre', (a) => [h('div', { class: 'fw-semibold' }, a.nombre || '(sin nombre)'), chipFaltan(revisar('asesores', a))]],
		['Cargo', (a) => a.cargo || '—'],
		['WhatsApp', (a) => a.whatsapp || '—'],
		['Estado', (a) => (a.activo ? badge('Visible', 'success') : badge('Oculto', 'secondary'))]
	],
	schema: () => [
		{ name: 'nombre', label: 'Nombre', required: true, cols: 6 },
		{ name: 'cargo', label: 'Cargo', cols: 6 },
		{ name: 'whatsapp', label: 'WhatsApp', type: 'telefono', cols: 6 },
		{ name: 'email', label: 'Correo', type: 'email', cols: 6 },
		{ name: 'bio', label: 'Descripción breve', type: 'textarea', rows: 3 },
		{ name: 'foto', label: 'Foto', type: 'image' },
		{ name: 'orden', label: 'Orden', type: 'number', cols: 3 },
		{ name: 'activo', label: 'Visible en el sitio', type: 'checkbox', cols: 9 },
		{ type: 'section', label: 'Sitio en inglés' },
		{ name: 'en.cargo', label: 'Title (English)', cols: 6, placeholder: 'Real estate advisor' },
		{ name: 'en.bio', label: 'Bio (English)', type: 'textarea', rows: 3 }
	],
	// Ocultarlo (deja de salir en el sitio) o eliminarlo: antes, sus casas y leads pasan a otro asesor.
	// Ocultarlo no mueve su trabajo; si entra al panel, se le dice a quien lo oculta que su acceso sigue igual.
	beforeSave: async (d, ref, all, antes) => {
		if (antes && antes.activo !== false && d.activo === false) {
			const usuarios = await usuariosDe(ref.id);
			if (usuarios.length) toast(`${usuarios.join(', ')} sigue entrando al panel con sus casas y leads: ocultarlo solo lo quita del sitio. Su acceso se cambia en Usuarios.`, 'warning');
		}
		return true;
	},
	antesDeEliminar: async (d, id) => {
		if (!(await reasignarAntesDeEliminar(d, id))) return false;
		// Su usuario del panel quedaría vinculado a un asesor que ya no existe (no vería nada): se dice antes.
		const usuarios = await usuariosDe(id);
		return !usuarios.length || confirmDialog(`${usuarios.join(', ')} entra al panel como este asesor y quedará sin casas ni leads. Después, en Usuarios, vincúlalo a otro asesor o quítale el acceso. ¿Eliminar?`, { okText: 'Eliminar' });
	},
	afterSave: invalidateAgents
});
