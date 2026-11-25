// Migración de los chats a la forma nueva (fotos servidas por /api/foto y notas solo del equipo). Se corre UNA vez en
// producción, después de publicar el código y las reglas nuevas (orden en docs/mapa-del-sistema.md, «Fotos del chat y
// notas del equipo»): con el botón «Pasar datos al formato nuevo» de Publicar (netlify/functions/migrar-chats.mjs) o con
// scripts/migrar-chats.mjs. Repetirla no cambia nada (solo toca lo que sigue con la forma de antes). Por fases:
//  0. Un chat de antes sin su índice (chatsPorSolicitud) lo recibe (sin él no se pueden subir fotos).
//  1. Por chat: las fotos de antes (chats/{token}/…) pasan a la carpeta de su solicitud (fotosChat/{solicitud}/, que no
//     cambia con el enlace) y su mensaje, que guardaba la dirección con el token de descarga, pasa a la ruta nueva; las
//     notas internas de chats/{token}/notas pasan a notasEquipo/{token}/notas (las que escribió un socio también: él ya
//     no las ve).
//  2. Los archivos de chats/, fotosChat/ y comprobantes/ pierden su token de descarga: las direcciones de antes (que el
//     socio podía leer en el mensaje) dejan de abrirlos. Solo la cuenta de servicio los abre (/api/foto).
//  3. El comprobante del pago a EQ de cada reserva (`comision.comprobante`) pasa de la dirección a su ruta.
//  4. De las revisiones del comprobante con la foto oculta se borran banco y referencia (el socio lee esa revisión).
// Por tandas (una función de Netlify se corta a los 10 s): `tanda` hace lo que quepa hasta `hasta` (o `porTanda` piezas)
// y devuelve el `cursor` para seguir (null: terminó). La pieza es un registro (un chat, un archivo, una reserva…): un
// chat se hace entero (copiar, cambiar los mensajes y después borrar), así una tanda cortada a la mitad se repite sin
// perder nada. Necesita las dos cuentas de servicio (GOOGLE_SA_* de lectura y GOOGLE_SA_ESCRITURA_*, esta con «Storage
// Object Admin»).
import { listar } from './firestore.mjs';
import { transaccion, listarCrudo, escribirLote } from './firestore-escritura.mjs';
import { listar as archivosDe, quitarLlave, copiar, borrar } from './storage.mjs';
import { rutaDeFoto, carpetaFotos, rutaDeComprobante } from '../../admin/js/hilo.js';

const TODOS = { tope: 1_000_000 };
export const cuentaVacia = () => ({ fotos: 0, archivos: 0, llaves: 0, notas: 0, revisiones: 0, comprobantes: 0, indices: 0 });

// Cada fase: `piezas()` → [{ clave, ... }] (lo que revisa, en orden por clave) y `hacer(pieza, aplicar, cuenta)`.
const FASES = [
	{
		// Un chat de antes sin su índice (chatsPorSolicitud/{solicitud}) no deja subir fotos (storage.rules lo lee): se le
		// pone, si es el único chat de esa solicitud (con dos, no se adivina: lo dice el aviso de Solicitudes).
		async piezas() {
			const porSolicitud = {};
			for (const c of await listar('chats', TODOS)) if (c.leadId) (porSolicitud[c.leadId] ||= []).push(c.id);
			const conIndice = new Set((await listar('chatsPorSolicitud', TODOS)).map((d) => d.id));
			return Object.entries(porSolicitud).filter(([leadId, lista]) => !conIndice.has(leadId) && lista.length === 1).map(([leadId, [token]]) => ({ clave: leadId, token }));
		},
		async hacer({ clave: leadId, token }, aplicar, cuenta) {
			cuenta.indices++;
			if (aplicar) await transaccion(async ({ leer, crear }) => { if (!(await leer(`chatsPorSolicitud/${leadId}`))) crear(`chatsPorSolicitud/${leadId}`, { token }); });
		}
	},
	{
		piezas: async () => (await listar('chats', TODOS)).map((c) => ({ clave: c.id, leadId: c.leadId || '' })),
		async hacer({ clave: t, leadId }, aplicar, cuenta) {
			// Las fotos de antes (chats/{token}/…) pasan a la carpeta de su solicitud, sin token de descarga (copiar las
			// escribe sin él). Primero se copian todas, después se cambian los mensajes y al final se borra lo de antes.
			const deAntes = leadId ? await archivosDe(`chats/${t}/`) : [];
			const aCarpeta = (ruta) => `${carpetaFotos(leadId)}${ruta.slice(`chats/${t}/`.length)}`;
			cuenta.archivos += deAntes.length;
			if (aplicar) await Promise.all(deAntes.map((a) => copiar(a.ruta, aCarpeta(a.ruta))));
			const cambios = [];
			for (const m of await listar(`chats/${t}/mensajes`, TODOS)) {
				const ruta = m.tipo === 'foto' ? rutaDeFoto({ token: t, leadId }, m.texto) : '';
				const nueva = ruta.startsWith('chats/') && leadId ? aCarpeta(ruta) : ruta;
				if (nueva && nueva !== m.texto) cambios.push([m.id, nueva]);
			}
			cuenta.fotos += cambios.length;
			if (aplicar) {
				await Promise.all(cambios.map(([id, texto]) => transaccion(({ cambiar }) => cambiar(`chats/${t}/mensajes/${id}`, { texto }))));
				await Promise.all(deAntes.map((a) => borrar(a.ruta)));
			}
			// Las notas, por lotes (copiar otra vez da lo mismo; primero se copian todas y después se borran).
			const notas = await listarCrudo(`chats/${t}`, 'notas').catch(() => []);
			cuenta.notas += notas.length;
			if (aplicar && notas.length) {
				await escribirLote(notas.map((n) => ({ poner: `notasEquipo/${t}/notas/${n.id}`, crudo: n.crudo })));
				await escribirLote(notas.map((n) => ({ borrar: `chats/${t}/notas/${n.id}` })));
			}
		}
	},
	{
		// Los archivos que queden con token de descarga en las carpetas cerradas (las fotos del chat y los comprobantes). Los
		// de chats/{token}/ de un chat con solicitud no: la fase de antes los pasa a su carpeta sin token (así lo que dice
		// que cambiaría no cuenta dos veces la misma foto).
		async piezas() {
			const seMueven = new Set((await listar('chats', TODOS)).filter((c) => c.leadId).map((c) => `chats/${c.id}/`));
			return (await Promise.all(['chats/', 'fotosChat/', 'comprobantes/'].map((c) => archivosDe(c)))).flat()
				.filter((a) => a.llave && !seMueven.has(a.ruta.slice(0, a.ruta.indexOf('/', 6) + 1))).map((a) => ({ clave: a.ruta }));
		},
		async hacer({ clave }, aplicar, cuenta) {
			cuenta.llaves++;
			if (aplicar) await quitarLlave(clave);
		}
	},
	{
		// El comprobante del pago a EQ: de la dirección con el token a su ruta (lo sirve /api/foto).
		piezas: async () => (await listar('reservas', TODOS)).map((r) => {
			const actual = r.comision?.comprobante;
			const ruta = actual ? rutaDeComprobante(r.id, actual) : '';
			return { clave: r.id, ruta, cambia: Boolean(ruta) && ruta !== actual };
		}).filter((x) => x.cambia),
		async hacer({ clave, ruta }, aplicar, cuenta) {
			cuenta.comprobantes++;
			if (aplicar) await transaccion(({ cambiar }) => cambiar(`reservas/${clave}`, { 'comision.comprobante': ruta }));
		}
	},
	{
		piezas: async () => (await listar('revisionesComprobante', TODOS)).filter((rv) => rv.oculta && (rv.leido?.banco || rv.leido?.referencia)).map((rv) => ({ clave: rv.id })),
		async hacer({ clave }, aplicar, cuenta) {
			cuenta.revisiones++;
			if (aplicar) await transaccion(({ cambiar }) => cambiar(`revisionesComprobante/${clave}`, { 'leido.banco': '', 'leido.referencia': '' }));
		}
	}
];
export const FASES_TOTAL = FASES.length;

// ¿Es un cursor que vino de `tanda`? { fase: 0…4, desde: la clave de la última pieza hecha }.
export const cursorValido = (c) => c === null || (Boolean(c) && typeof c === 'object' && Number.isInteger(c.fase) && c.fase >= 0 && c.fase < FASES.length
	&& typeof c.desde === 'string' && c.desde.length <= 1024);

// Una tanda: { cuenta (lo de esta tanda), cursor (null: terminó) }. Siempre hace al menos una pieza (así avanza).
export async function tanda({ aplicar = false, cursor = null, hasta = Infinity, porTanda = Infinity } = {}) {
	const cuenta = cuentaVacia();
	let { fase = 0, desde = '' } = cursor || {};
	let hechas = 0;
	const basta = () => hechas > 0 && (hechas >= porTanda || Date.now() >= hasta);
	for (; fase < FASES.length; fase++, desde = '') {
		if (basta()) return { cuenta, cursor: { fase, desde } };
		const piezas = (await FASES[fase].piezas()).filter((p) => p.clave > desde).sort((a, b) => (a.clave < b.clave ? -1 : 1));
		for (const p of piezas) {
			if (basta()) return { cuenta, cursor: { fase, desde } };
			await FASES[fase].hacer(p, aplicar, cuenta);
			desde = p.clave;
			hechas++;
		}
	}
	return { cuenta, cursor: null };
}

export const sumarCuenta = (a, b) => Object.fromEntries(Object.keys(cuentaVacia()).map((k) => [k, (a[k] || 0) + (b[k] || 0)]));

// Todo de una vez, tanda tras tanda (el script y el entorno local). Devuelve la cuenta total.
export async function migrarChats({ aplicar = false, log = console.log } = {}) {
	let total = cuentaVacia(), cursor = null;
	do {
		const r = await tanda({ aplicar, cursor });
		total = sumarCuenta(total, r.cuenta);
		cursor = r.cursor;
	} while (cursor);
	log(`${aplicar ? 'Migrado' : 'Por migrar (sin --aplicar no se escribe nada)'}: ${total.archivos} fotos de antes a la carpeta de su solicitud, ${total.fotos} fotos a su ruta, ${total.llaves} tokens de descarga quitados, ${total.notas} notas a notasEquipo, ${total.indices} índices de chats de antes, ${total.comprobantes} comprobantes de la comisión a su ruta, ${total.revisiones} revisiones ocultas sin banco ni referencia.`);
	return total;
}
