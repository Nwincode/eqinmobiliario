// Cada hora: si cambió qué socios deben una comisión hace más de 72 h, vuelve a publicar el sitio,
// para que sus casas salgan de los listados o regresen solas cuando el administrador la marca pagada.
import { SITE_URL } from '../lib/correo.mjs';
import { datosConfigurados, leerPrivado } from '../lib/firestore.mjs';
import { sociosEnMora, pausados } from '../lib/comisiones.mjs';

export default async () => {
	if (!datosConfigurados()) return;
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
