// Migración de los chats a la forma nueva (fotos servidas por /api/foto y notas solo del equipo). Se corre UNA vez en
// producción, después de publicar el código y las reglas nuevas (orden en docs/mapa-del-sistema.md, «Fotos del chat y
// notas del equipo»); repetirla no cambia nada (solo toca lo que sigue con la forma de antes):
//  1. Las fotos del chat de antes (chats/{token}/…) pasan a la carpeta de su solicitud (fotosChat/{solicitud}/, que no
//     cambia con el enlace) y su mensaje, que guardaba la dirección con el token de descarga, pasa a la ruta nueva.
//  2. Los archivos de chats/, fotosChat/ y comprobantes/ pierden su token de descarga: las direcciones de antes (que el
//     socio podía leer en el mensaje) dejan de abrirlos. Solo la cuenta de servicio los abre (/api/foto).
//  2b. El comprobante del pago a EQ de cada reserva (`comision.comprobante`) pasa de la dirección a su ruta.
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
import { listar as archivosDe, quitarLlave, copiar, borrar } from '../netlify/lib/storage.mjs';
import { rutaDeFoto, carpetaFotos } from '../admin/js/hilo.js';
import { rutaDeComprobante } from '../netlify/functions/foto.mjs';

export async function migrarChats({ aplicar = false, log = console.log } = {}) {
	const cuenta = { fotos: 0, archivos: 0, llaves: 0, notas: 0, revisiones: 0, comprobantes: 0 };
	for (const chat of await listar('chats')) {
		const t = chat.id, leadId = chat.leadId || '';
		// Las fotos de antes (chats/{token}/…) pasan a la carpeta de su solicitud, sin token de descarga (copiar las escribe sin él).
		const deAntes = leadId ? await archivosDe(`chats/${t}/`) : [];
		const aCarpeta = (ruta) => `${carpetaFotos(leadId)}${ruta.slice(`chats/${t}/`.length)}`;
		for (const a of deAntes) {
			cuenta.archivos++;
			if (aplicar) await copiar(a.ruta, aCarpeta(a.ruta));
		}
		for (const m of await listar(`chats/${t}/mensajes`)) {
			const ruta = m.tipo === 'foto' ? rutaDeFoto({ token: t, leadId }, m.texto) : '';
			const nueva = ruta.startsWith('chats/') && leadId ? aCarpeta(ruta) : ruta;
			if (!nueva || nueva === m.texto) continue;
			cuenta.fotos++;
			if (aplicar) await transaccion(({ cambiar }) => cambiar(`chats/${t}/mensajes/${m.id}`, { texto: nueva }));
		}
		if (aplicar) for (const a of deAntes) await borrar(a.ruta);
		const notas = await listar(`chats/${t}/notas`).catch(() => []);
		if (notas.length) {
			cuenta.notas += notas.length;
			if (aplicar) await transaccion(async ({ leerCrudo, crearCrudo, borrar: quitar }) => {
				for (const n of notas) {
					const [vieja, nueva] = await Promise.all([leerCrudo(`chats/${t}/notas/${n.id}`), leerCrudo(`notasEquipo/${t}/notas/${n.id}`)]);
					if (vieja && !nueva) crearCrudo(`notasEquipo/${t}/notas/${n.id}`, vieja.crudo);
					if (vieja) quitar(`chats/${t}/notas/${n.id}`);
				}
			});
		}
	}
	// Los archivos que queden con token de descarga en las carpetas cerradas (las fotos del chat y los comprobantes).
	for (const carpeta of ['chats/', 'fotosChat/', 'comprobantes/']) {
		for (const a of await archivosDe(carpeta)) {
			if (!a.llave) continue;
			cuenta.llaves++;
			if (aplicar) await quitarLlave(a.ruta);
		}
	}
	// El comprobante del pago a EQ: de la dirección con el token a su ruta (lo sirve /api/foto).
	for (const r of await listar('reservas')) {
		const actual = r.comision?.comprobante;
		const ruta = actual ? rutaDeComprobante(r.id, actual) : '';
		if (!ruta || ruta === actual) continue;
		cuenta.comprobantes++;
		if (aplicar) await transaccion(({ cambiar }) => cambiar(`reservas/${r.id}`, { 'comision.comprobante': ruta }));
	}
	for (const rv of await listar('revisionesComprobante')) {
		if (!rv.oculta || !(rv.leido?.banco || rv.leido?.referencia)) continue;
		cuenta.revisiones++;
		if (aplicar) await transaccion(({ cambiar }) => cambiar(`revisionesComprobante/${rv.id}`, { 'leido.banco': '', 'leido.referencia': '' }));
	}
	log(`${aplicar ? 'Migrado' : 'Por migrar (sin --aplicar no se escribe nada)'}: ${cuenta.archivos} fotos de antes a la carpeta de su solicitud, ${cuenta.fotos} fotos a su ruta, ${cuenta.llaves} tokens de descarga quitados, ${cuenta.notas} notas a notasEquipo, ${cuenta.comprobantes} comprobantes de la comisión a su ruta, ${cuenta.revisiones} revisiones ocultas sin banco ni referencia.`);
	return cuenta;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	migrarChats({ aplicar: process.argv.includes('--aplicar') }).catch((err) => { console.error(err.message); process.exit(1); });
}
