// Cada hora: si cambió qué socios deben una comisión hace más de 72 h, vuelve a publicar el sitio,
// para que sus casas salgan de los listados o regresen solas cuando el administrador la marca pagada.
// También recalcula los permisos de los socios (a los 7 días de atraso se apagan; al pagar vuelven): netlify/lib/permisos.mjs.
// Mientras la última publicación esté marcada como fallida (deploy-failed.mjs) no vuelve a publicar: fallaría igual cada
// hora. El equipo ya recibió el correo del fallo; al publicar bien, esto sigue solo.
import { SITE_URL } from '../lib/correo.mjs';
import { datosConfigurados } from '../lib/firestore.mjs';
import { publicarSitio, estadoPublicacion } from '../lib/publicar.mjs';
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
		const { estado, hook } = await estadoPublicacion();
		if (estado.fallo) return console.log('comisiones-vencidas: la última publicación falló; se espera a que se publique bien.');
		if (hook) await publicarSitio(hook);
	} catch (e) {
		console.error('comisiones-vencidas:', e.message);
	}
};

export const config = { schedule: '5 * * * *' };
