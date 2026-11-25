// Migración de los chats a la forma nueva (fotos servidas por /api/foto y notas solo del equipo). Se corre UNA vez en
// producción, después de publicar el código y las reglas nuevas (orden en docs/mapa-del-sistema.md, «Fotos del chat y
// notas del equipo»); repetirla no cambia nada (solo toca lo que sigue con la forma de antes):
//  1. Cada foto del chat guardada como dirección con el token de descarga pasa a su ruta (chats/{token}/{archivo}).
//  2. Cada archivo de chats/ pierde su token de descarga: las direcciones de antes (que el socio podía leer en el mensaje)
//     dejan de abrir la foto. Solo la cuenta de servicio la abre (/api/foto).
//  3. Las notas internas de chats/{token}/notas pasan a notasEquipo/{token}/notas (las que escribió un socio también: él
//     ya no las ve).
//  4. De las revisiones del comprobante con la foto oculta se borran banco y referencia (el socio lee esa revisión).
// Necesita las dos cuentas de servicio (GOOGLE_SA_* de lectura y GOOGLE_SA_ESCRITURA_*, esta con «Storage Object Admin»).
//   node scripts/migrar-chats.mjs              dice qué cambiaría, sin escribir nada
//   node scripts/migrar-chats.mjs --aplicar    lo hace
// En el entorno local (lo corre scripts/entorno/levantar.sh): node --import ./scripts/entorno/red-local.mjs scripts/migrar-chats.mjs --aplicar
import { pathToFileURL } from 'node:url';
import { listar } from '../netlify/lib/firestore.mjs';
import { transaccion } from '../netlify/lib/firestore-escritura.mjs';
import { listar as archivosDe, quitarLlave } from '../netlify/lib/storage.mjs';
import { rutaDeFoto } from '../admin/js/hilo.js';

export async function migrarChats({ aplicar = false, log = console.log } = {}) {
	const cuenta = { fotos: 0, llaves: 0, notas: 0, revisiones: 0 };
	for (const chat of await listar('chats')) {
		const t = chat.id;
		for (const m of await listar(`chats/${t}/mensajes`)) {
			const ruta = m.tipo === 'foto' ? rutaDeFoto(t, m.texto) : '';
			if (!ruta || ruta === m.texto) continue;
			cuenta.fotos++;
			if (aplicar) await transaccion(({ cambiar }) => cambiar(`chats/${t}/mensajes/${m.id}`, { texto: ruta }));
		}
		for (const a of await archivosDe(`chats/${t}/`)) {
			if (!a.llave) continue;
			cuenta.llaves++;
			if (aplicar) await quitarLlave(a.ruta);
		}
		const notas = await listar(`chats/${t}/notas`).catch(() => []);
		if (notas.length) {
			cuenta.notas += notas.length;
			if (aplicar) await transaccion(async ({ leerCrudo, crearCrudo, borrar }) => {
				for (const n of notas) {
					const [vieja, nueva] = await Promise.all([leerCrudo(`chats/${t}/notas/${n.id}`), leerCrudo(`notasEquipo/${t}/notas/${n.id}`)]);
					if (vieja && !nueva) crearCrudo(`notasEquipo/${t}/notas/${n.id}`, vieja.crudo);
					if (vieja) borrar(`chats/${t}/notas/${n.id}`);
				}
			});
		}
	}
	for (const rv of await listar('revisionesComprobante')) {
		if (!rv.oculta || !(rv.leido?.banco || rv.leido?.referencia)) continue;
		cuenta.revisiones++;
		if (aplicar) await transaccion(({ cambiar }) => cambiar(`revisionesComprobante/${rv.id}`, { 'leido.banco': '', 'leido.referencia': '' }));
	}
	log(`${aplicar ? 'Migrado' : 'Por migrar (sin --aplicar no se escribe nada)'}: ${cuenta.fotos} fotos a su ruta, ${cuenta.llaves} tokens de descarga quitados, ${cuenta.notas} notas a notasEquipo, ${cuenta.revisiones} revisiones ocultas sin banco ni referencia.`);
	return cuenta;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	migrarChats({ aplicar: process.argv.includes('--aplicar') }).catch((err) => { console.error(err.message); process.exit(1); });
}
