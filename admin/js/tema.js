// El panel usa los mismos colores que el sitio (Contenido → Colores).
import { db, doc, getDoc } from './firebase.js';
import { COLORES_TEMA, RADIO_TEMA, variablesTema } from './tema-def.js';

export async function aplicarTema(tema) {
	try {
		if (!tema) tema = (await getDoc(doc(db, 'settings', 'site'))).data()?.tema;
		const raiz = document.documentElement.style;
		[...COLORES_TEMA, RADIO_TEMA].forEach((c) => raiz.removeProperty(c.variable));
		Object.entries(variablesTema(tema || {})).forEach(([k, v]) => raiz.setProperty(k, v));
	} catch {
		// Sin tema guardado o sin permiso: quedan los colores originales.
	}
}
