// Cada hora: si cambió qué socios deben una comisión hace más de 72 h, vuelve a publicar el sitio,
// para que sus casas salgan de los listados o regresen solas cuando el administrador la marca pagada.
// También recalcula los permisos de los socios (a los 7 días de atraso se apagan; al pagar vuelven): netlify/lib/permisos.mjs.
import { SITE_URL } from '../lib/correo.mjs';
import { datosConfigurados, leerPrivado } from '../lib/firestore.mjs';
import { sociosEnMora, pausados } from '../lib/comisiones.mjs';
import { escrituraConfigurada } from '../lib/firestore-escritura.mjs';
import { recalcularPermisos } from '../lib/permisos.mjs';

export default async () => {
	if (!datosConfigurados()) return;
	if (escrituraConfigurada()) {
		try { await recalcularPermisos(); } catch (e) { console.error('comisiones-vencidas (permisos):', e.message); }
	}
	try {
		const publicado = await fetch(`${SITE_URL}/pausados.txt`);
		// Sin el archivo, el sitio se publicó sin acceso a las reservas: no hay con qué comparar.
		if (!publicado.ok || (await publicado.text()).trim() === pausados(await sociosEnMora())) return;
		const hook = (await leerPrivado('settings/private'))?.netlifyBuildHook;
		if (hook) await fetch(hook, { method: 'POST' });
	} catch (e) {
		console.error('comisiones-vencidas:', e.message);
	}
};

export const config = { schedule: '5 * * * *' };
