// Pruebas de firestore.rules contra el emulador de Firestore, con datos inventados: la reserva por noche
// y su chat (quién lee, quién escribe, qué se bloquea). Se corre con `npm run test:reglas`, que levanta
// el emulador limpio (scripts/emulador/correr.sh); cada caso depende del estado que dejó el anterior.
// «permite» espera 200; «niega» espera 403 (o 400).
const H = 'http://127.0.0.1:8085/v1/projects/demo-eq/databases/(default)/documents';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: uid, user_id: uid, iss: 'https://securetoken.google.com/demo-eq', aud: 'demo-eq', iat: 1, exp: 9999999999 })}.`;
const cab = (quien) => ({ 'Content-Type': 'application/json', ...(quien === 'dueño' ? { Authorization: 'Bearer owner' } : quien ? { Authorization: `Bearer ${jwt(quien)}` } : {}) });
const val = (v) => typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const campos = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const poner = (ruta, o) => fetch(`${H}/${ruta}`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: campos(o) }) }).then((r) => r.status);
const crear = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `projects/demo-eq/databases/(default)/documents/${ruta}`, fields: campos(o) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
const leer = (quien, ruta) => fetch(`${H}/${ruta}`, { headers: cab(quien) }).then((r) => r.status);
const consulta = (quien, col, campo, valor) => fetch(`${H}:runQuery`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], ...(campo ? { where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: val(valor) } } } : {}) } }) }).then((r) => r.status);

await poner('users/admin1', { rol: 'admin', activo: true, nombre: 'Admin' });
await poner('users/socio1', { rol: 'socio', activo: true, propietarioId: 'o1', nombre: 'Socio Uno' });
await poner('users/socio2', { rol: 'socio', activo: true, propietarioId: 'o2', nombre: 'Socio Dos' });
await poner('properties/prueba-casa-playa-monterrico', { titulo: 'Casa de playa en Monterrico (prueba)', operacion: 'vacacional', publicado: true, propietarioId: 'o1' });

await poner('propietarios/o1', { nombre: 'Socio Uno', telefono: '55550001', agentId: 'a1', datosPago: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno' });
await poner('propietarios/o2', { nombre: 'Socio Dos', agentId: 'a1', datosPago: 'Banrural 9988776655' });
// La cotización de las solicitudes de prueba: la misma que lleva su chat (las reglas exigen que coincidan).
const cotizada = (codigo) => ({ mapValue: { fields: campos({ codigo, llegada: '2026-11-16', salida: '2026-11-20', noches: 4, huespedes: 2, subtotal: 920, impuestos: 202.4, total: 1122.4, moneda: 'USD' }) } });
await fetch(`${H}/leads/lead1`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: new Date().toISOString() }, nombre: val('Ana Morales'), telefono: val('55551234'), email: val('ana@example.com'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: cotizada('EQ-PRUEBA') } }) });
const T = 'TokenDePruebaLargoYAlAzar2345';
const chat = { leadId: 'lead1', codigo: 'EQ-PRUEBA', propertyId: 'prueba-casa-playa-monterrico', propertyTitulo: 'Casa de playa en Monterrico (prueba)', propietarioId: 'o1', nombre: 'Ana', llegada: '2026-11-16', salida: '2026-11-20', noches: 4, huespedes: 2, total: 1122.4, subtotal: 920, moneda: 'USD', idioma: 'es' };
const svG = (v) => ({ stringValue: v });
// Como «Mis propiedades»: si cambian los precios del dueño, el renglón de la bitácora va en el mismo lote
// (admin/js/bitacora.js fotoCasa, con lo guardado antes y lo que queda) y privado/socio lo nombra en bitacoraId.
let nb = 0;
const fotoCasaRaw = (p, s) => ({ mapValue: { fields: {
	moneda: p.moneda || svG(''), propietarioId: p.propietarioId || svG(''), limpieza: p.vacacional?.mapValue?.fields?.limpieza || { integerValue: '0' },
	precioBase: s.precioBase || { integerValue: '0' }, precioFinde: s.precioFinde || { integerValue: '0' }, tarifas: s.tarifas || { arrayValue: {} }, margen: s.margen || { integerValue: '20' } } } });
const crudo = async (ruta) => (await (await fetch(`${H}/${ruta}`, { headers: cab('dueño') })).json()).fields || {};
// Además, como el panel, el texto de lo que cambió en la bitácora de la casa (properties/{id}/bitacora), en el mismo lote:
// el tope de 1000 revisiones es de todo el pedido.
let nt = 0;
const conTexto = (quien, writes) => {
	const casa = writes.map((w) => w.update?.name.match(/\/properties\/([^/]+)$/)?.[1]).find(Boolean);
	return casa ? [...writes, { update: { name: `projects/demo-eq/databases/(default)/documents/properties/${casa}/bitacora/txt${++nt}`, fields: { que: svG('precio entre semana'), quien: svG(quien), nombre: svG('Dueña') } },
		currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] }] : writes;
};
async function conRenglon(quien, sinTexto, { antesOtro = null } = {}) {
	const writes = conTexto(quien, sinTexto);
	const i = writes.findIndex((w) => w.update?.name.endsWith('/privado/socio'));
	if (i < 0) return writes;
	const casaId = writes[i].update.name.split('/properties/')[1].split('/')[0];
	const [pc, so] = await Promise.all([crudo(`properties/${casaId}`), crudo(`properties/${casaId}/privado/socio`)]);
	const despues = { ...so, ...writes[i].update.fields };
	if (JSON.stringify(fotoCasaRaw(pc, so)) === JSON.stringify(fotoCasaRaw(pc, despues))) return writes;
	const id = `bit${++nb}`;
	const w = structuredClone(writes);
	w[i].update.fields.bitacoraId = svG(id); if (w[i].updateMask) w[i].updateMask.fieldPaths.push('bitacoraId');
	return [...w, { update: { name: `projects/demo-eq/databases/(default)/documents/bitacora/${id}`, fields: { tipo: svG('casa'), objeto: svG(casaId), casa: svG(casaId), antes: antesOtro || fotoCasaRaw(pc, so), despues: fotoCasaRaw(pc, despues), quien: svG(quien), nombre: svG('Dueña') } },
		currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] }];
}
const loteConRenglon = async (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: await conRenglon(quien, writes) }) }).then((r) => r.status);

let fallas = 0, n = 0;
const espera = async (nombre, promesa, ok) => { const s = await promesa; const bien = ok ? s === 200 : s === 403; n++; if (!bien) fallas++; console.log(`${bien ? 'ok   ' : 'FALLA'} ${ok ? 'permite' : 'niega  '} · ${nombre} (${s})`); };
const m = (de, texto) => ({ de, texto });
let i = 0; const msj = () => `chats/${T}/mensajes/m${++i}`;

// El chat y su índice chatsPorSolicitud/{solicitud} los crea el servidor junto con la solicitud
// (netlify/functions/solicitud.mjs, scripts/test-solicitud.mjs); desde el navegador, nadie.
const RAIZ = 'projects/demo-eq/databases/(default)/documents';
const crearChat = (token, o, { indice = true, lead = o.leadId, encima = false } = {}) => fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes: [
	{ update: { name: `${RAIZ}/chats/${token}`, fields: campos(o) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
	...(indice ? [{ update: { name: `${RAIZ}/chatsPorSolicitud/${lead}`, fields: campos({ token }) }, ...(encima ? {} : { currentDocument: { exists: false } }) }] : [])] }) }).then((r) => r.status);
await espera('cliente abre el chat de su reserva con su índice, directo en la base (lo hace el servidor)', crearChat(T, chat), false);
await espera('cliente abre un chat sin índice', crearChat(T, chat, { indice: false }), false);
await espera('socio abre un chat', fetch(`${H}:commit`, { method: 'POST', headers: cab('socio1'), body: JSON.stringify({ writes: [{ update: { name: `${RAIZ}/chats/${T}`, fields: campos(chat) }, currentDocument: { exists: false } }] }) }).then((r) => r.status), false);
// El chat de la solicitud, como lo deja el servidor.
await poner(`chats/${T}`, chat);
await fetch(`${H}/chats/${T}?updateMask.fieldPaths=createdAt`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: new Date().toISOString() } } }) });
await poner('chatsPorSolicitud/lead1', { token: T });
await espera('nadie cambia el índice de una solicitud a otro chat', fetch(`${H}/chatsPorSolicitud/lead1`, { method: 'PATCH', headers: cab(null), body: JSON.stringify({ fields: campos({ token: 'OtroChat' }) }) }).then((r) => r.status), false);
await espera('anónimo lee el índice', leer(null, 'chatsPorSolicitud/lead1'), false);
await espera('administrador lee el índice (control)', leer('admin1', 'chatsPorSolicitud/lead1'), true);
{
	const probar = await leer(null, `chatsPorSolicitud/prueba-${Math.random().toString(36).slice(2)}`);
	n++; if (probar !== 404) fallas++; console.log(`${probar === 404 ? 'ok   ' : 'FALLA'} 404    · leer un índice que no existe responde «no existe» (las páginas de antes lo consultan) (${probar})`);
}
// Solicitud de antes (sin índice): su chat ya existe. Nadie le inventa otro chat con su índice ni le pone índice a un
// chat ya existente; solo el administrador, al chat de esa solicitud (Solicitudes lo hace al abrirla).
{
	const viejo = new Date(Date.now() - 3 * 86400_000).toISOString();
	await fetch(`${H}/leads/lead-vieja`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: viejo }, nombre: val('Vieja'), telefono: val('5555'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: cotizada('EQ-VJA') } }) });
	const CV = 'ChatDeUnaSolicitudDeAntesLargo123';
	await poner(`chats/${CV}`, { ...chat, leadId: 'lead-vieja', codigo: 'EQ-VJA' });
	const indice = (quien, token) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${RAIZ}/chatsPorSolicitud/lead-vieja`, fields: campos({ token }) }, currentDocument: { exists: false } }] }) }).then((r) => r.status);
	await espera('anónimo pone el índice de una solicitud de antes a su chat ya existente', indice(null, CV), false);
	await espera('socio pone el índice de una solicitud de antes', indice('socio1', CV), false);
	await espera('administrador pone el índice de una solicitud de antes a un chat de otra solicitud', indice('admin1', T), false);
	await espera('administrador pone el índice de una solicitud de antes a su chat (control)', indice('admin1', CV), true);
	await espera('administrador lista los índices (control)', consulta('admin1', 'chatsPorSolicitud'), true);
}
{
	const r5 = await leer(null, 'reglas/r5');
	n++; if (r5 !== 404) fallas++; console.log(`${r5 === 404 ? 'ok   ' : 'FALLA'} 404    · leer reglas/r5 responde «no existe» (las páginas de antes lo consultan) (${r5})`);
	await espera('nadie escribe en reglas/r5', fetch(`${H}/reglas/r5`, { method: 'PATCH', headers: cab(null), body: JSON.stringify({ fields: campos({ x: 1 }) }) }).then((r) => r.status), false);
}
await espera('quien tiene el enlace lee su reserva', leer(null, `chats/${T}`), true);
await espera('anónimo lista todas las conversaciones', consulta(null, 'chats'), false);
await espera('cliente escribe', crear(null, msj(), m('cliente', '¿Aceptan 2 perros? Llegamos el 16/11/2026 a las 15:00')), true);
await espera('cliente lee los mensajes', leer(null, `chats/${T}/mensajes`), true);
await espera('cliente firma como equipo', crear(null, msj(), m('equipo', 'Hola')), false);
await espera('cliente firma como socio', crear(null, msj(), m('socio', 'Hola')), false);
await espera('cliente manda su teléfono', crear(null, msj(), m('cliente', 'mi número es 5555-1234')), false);
await espera('cliente manda su correo', crear(null, msj(), m('cliente', 'ana@correo.com')), false);
await espera('socio dueño responde', crear('socio1', msj(), m('socio', 'Sí, se aceptan mascotas pequeñas.')), true);
await espera('socio dueño firma como equipo', crear('socio1', msj(), m('equipo', 'Soy del equipo')), false);
await espera('socio dueño firma como cliente', crear('socio1', msj(), m('cliente', 'Ya no quiero')), false);
await espera('socio manda su teléfono con espacios', crear('socio1', msj(), m('socio', 'llamame al 55 55 12 34')), false);
await espera('cliente manda su teléfono en dígitos de ancho completo', crear(null, msj(), m('cliente', 'mi cel ５５５５１２３４')), false);
await espera('cliente manda su teléfono en dígitos arábigos', crear(null, msj(), m('cliente', 'mi cel ٥٥٥٥١٢٣٤')), false);
await espera('cliente manda su teléfono en números encerrados (①②③…)', crear(null, msj(), m('cliente', 'mi cel ⑤⑤⑤⑤①②③④')), false);
await espera('cliente manda su correo con la arroba de ancho completo', crear(null, msj(), m('cliente', 'ana＠gmail')), false);
// El filtro de la regla es el del navegador (js/calc-vacacional.js FILTRO_CONTACTO → scripts/reglas-contacto.mjs): el
// mismo corpus da lo mismo en los dos (scripts/corpus-contacto.mjs).
{
	await import('../../js/calc-vacacional.js');
	const { NORMALES, EVASIONES, BLOQUEADAS_A_PROPOSITO, EVASIONES_GENERADAS } = await import('../corpus-contacto.mjs');
	const distintas = [];
	// De las generadas, una de cada 20 (todas corren en npm test contra el navegador; aquí, que la regla diga lo mismo).
	const muestra = EVASIONES_GENERADAS.filter((t, i) => i % 20 === 0);
	for (const texto of [...NORMALES, ...EVASIONES, ...BLOQUEADAS_A_PROPOSITO, ...muestra].filter(Boolean)) {
		const s = await crear(null, msj(), m('cliente', texto));
		const navegador = globalThis.EQVacacional.tieneContacto(texto);
		if ((s === 200) === navegador || (s !== 200 && s !== 403)) distintas.push(`${texto} (regla ${s}, navegador ${navegador ? 'bloquea' : 'deja'})`);
	}
	{
		let largo = ''; while (largo.length < 1000) largo += 'Hola, somos 4 adultos y 2 niños, llegamos el viernes 20 a las 3 de la tarde. Pagué 1500 + 350 de limpieza. ';
		const s = await crear(null, msj(), m('cliente', largo.slice(0, 1000)));
		if (s !== 200) distintas.push(`mensaje normal de 1000 letras (${s})`);
	}
	n++; if (distintas.length) fallas++;
	console.log(`${distintas.length ? 'FALLA' : 'ok   '} igual  · el filtro de la regla y el del navegador dicen lo mismo de ${NORMALES.length + EVASIONES.length + BLOQUEADAS_A_PROPOSITO.length + muestra.length} frases${distintas.length ? `: ${distintas.join(' | ')}` : ''}`);
}
await espera('cliente escribe una fecha y una hora (control)', crear(null, msj(), m('cliente', 'Llegamos el 16 a las 3')), true);
await espera('socio manda un enlace', crear('socio1', msj(), m('socio', 'mira https://micasa.gt')), false);
await espera('socio dueño lista sus conversaciones', consulta('socio1', 'chats', 'propietarioId', 'o1'), true);
await espera('socio dueño lee los mensajes', leer('socio1', `chats/${T}/mensajes`), true);
await espera('otro socio lista conversaciones ajenas', consulta('socio2', 'chats', 'propietarioId', 'o1'), false);
await espera('otro socio lee mensajes ajenos', leer('socio2', `chats/${T}/mensajes`), false);
await espera('otro socio escribe en chat ajeno', crear('socio2', msj(), m('socio', 'Hola')), false);
await espera('equipo responde', crear('admin1', msj(), m('equipo', 'Confirmamos tu reserva.')), true);
await espera('equipo lista todas', consulta('admin1', 'chats'), true);
await espera('nadie edita un mensaje', fetch(`${H}/chats/${T}/mensajes/m1`, { method: 'PATCH', headers: cab('socio1'), body: JSON.stringify({ fields: campos({ de: 'cliente', texto: 'cambiado' }) }) }).then((r) => r.status), false);
await espera('nadie borra un mensaje', fetch(`${H}/chats/${T}/mensajes/m1`, { method: 'DELETE', headers: cab(null) }).then((r) => r.status), false);

// Estado de la solicitud en el chat
const act = (quien, o) => fetch(`${H}/chats/${T}?${Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: cab(quien), body: JSON.stringify({ fields: campos(o) }) }).then((r) => r.status);
await espera('cliente marca su reserva como confirmada', act(null, { estado: 'confirmada' }), false);
await espera('otro socio marca el estado', act('socio2', { estado: 'confirmada' }), false);
await espera('socio dueño cambia el total', act('socio1', { total: 1 }), false);
// Confirmar sin reserva (sin comisión registrada): no. Con su reserva (la escribe el mismo lote; aquí ya está).
await espera('socio confirma el chat sin crear la reserva', act('socio1', { estado: 'confirmada' }), false);
await espera('socio manda sus datos de pago sin reserva', crear('socio1', msj(), { de: 'socio', tipo: 'pago', texto: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno' }), false);
await poner('reservas/lead1', { propertyId: 'prueba-casa-playa-monterrico', propietarioId: 'o1', estado: 'confirmada', leadId: 'lead1', codigo: 'EQ-PRUEBA' });
// Desde las reservas por servidor (netlify/functions/reservas.mjs), el estado del chat lo escribe el servidor por el socio.
await espera('socio dueño marca confirmada directo, con su reserva (lo hace el servidor)', act('socio1', { estado: 'confirmada' }), false);
await espera('administrador marca confirmada (camino del administrador)', act('admin1', { estado: 'confirmada' }), true);
await espera('socio dueño inventa un estado', act('socio1', { estado: 'regalada' }), false);
// El socio y los datos del cliente
await espera('socio dueño lee la solicitud (teléfono del cliente)', leer('socio1', 'leads/lead1'), false);
await espera('el administrador borra una solicitud de reserva (su reserva y su chat la buscan)', fetch(`${H}/leads/lead1`, { method: 'DELETE', headers: cab('admin1') }).then((r) => r.status), false);
await poner('leads/lead-contacto', { nombre: 'Contacto', telefono: '55550000', agentId: '' });
await espera('el administrador borra un lead de contacto (control)', fetch(`${H}/leads/lead-contacto`, { method: 'DELETE', headers: cab('admin1') }).then((r) => r.status), true);
await espera('socio dueño lista las solicitudes de sus casas', consulta('socio1', 'leads', 'propietarioId', 'o1'), false);
// Lo que escribe el socio en la solicitud: solo agrega un renglón al historial.
const renglon = (que) => ({ mapValue: { fields: campos({ que, quien: 'socio1', cuando: new Date().toISOString() }) } });
const solicitudDe = (quien, ruta, f, historial = [renglon('x')]) => fetch(`${H}/${ruta}?updateMask.fieldPaths=solicitud`, { method: 'PATCH', headers: cab(quien),
	body: JSON.stringify({ fields: { solicitud: { mapValue: { fields: { ...campos(f), historial: { arrayValue: { values: historial } } } } } } }) }).then((r) => r.status);
const primero = renglon('Confirmó');
await espera('socio responde la solicitud sin su renglón de historial', solicitudDe('socio1', 'leads/lead1', { estado: 'confirmada' }, []), false);
await espera('socio dueño responde la solicitud directo, con su reserva (lo hace el servidor)', solicitudDe('socio1', 'leads/lead1', { estado: 'confirmada' }, [primero]), false);
await espera('administrador responde la solicitud (camino del administrador)', solicitudDe('admin1', 'leads/lead1', { estado: 'confirmada' }, [primero]), true);
await espera('socio reescribe el historial de la solicitud', solicitudDe('socio1', 'leads/lead1', { estado: 'cancelada' }, [renglon('Otro'), renglon('Canceló')]), false);
await espera('socio cancela la solicitud con la reserva viva (sale de «Por cobrar»)', solicitudDe('socio1', 'leads/lead1', { estado: 'cancelada' }, [primero, renglon('Canceló')]), false);
await espera('socio regresa la solicitud a «sin responder»', solicitudDe('socio1', 'leads/lead1', { estado: 'pendiente' }), false);
await espera('socio pasa una confirmada a «no se dio»', solicitudDe('socio1', 'leads/lead1', { estado: 'no' }), false);
await espera('socio mete otro campo en la solicitud', solicitudDe('socio1', 'leads/lead1', { estado: 'cancelada', telefono: '5555 0001' }), false);
await espera('administrador lee la solicitud', leer('admin1', 'leads/lead1'), true);
await espera('socio lee su propia ficha (notas y bitácora internas)', leer('socio1', 'propietarios/o1'), false);
await espera('socio lee la ficha de otro socio', leer('socio1', 'propietarios/o2'), false);
// Datos de pago
const pago = (de, texto) => ({ de, texto, tipo: 'pago' });
await espera('socio manda sus datos de pago guardados directo (los manda el servidor)', crear('socio1', msj(), pago('socio', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno')), false);
await espera('socio manda como «pago» otro texto (su teléfono)', crear('socio1', msj(), pago('socio', 'Llamame al 5555 0001')), false);
await espera('cliente manda un «pago»', crear(null, msj(), pago('cliente', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno')), false);
await espera('otro socio manda un «pago» en chat ajeno', crear('socio2', msj(), pago('socio', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno')), false);
await espera('equipo manda los datos de pago del socio', crear('admin1', msj(), pago('equipo', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno')), true);
// Visto, llegada y foto
const visto = (quien, campo) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `projects/demo-eq/databases/(default)/documents/chats/${T}`, fields: {} }, updateMask: { fieldPaths: [] }, currentDocument: { exists: true }, updateTransforms: [{ fieldPath: campo, setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
await espera('cliente marca su visto', visto(null, 'vistoCliente'), true);
await espera('cliente marca el visto del socio', visto(null, 'vistoSocio'), false);
await espera('socio dueño marca su visto', visto('socio1', 'vistoSocio'), true);
await espera('otro socio marca visto', visto('socio2', 'vistoSocio'), false);
await espera('equipo marca su visto', visto('admin1', 'vistoEquipo'), true);
await espera('socio manda la dirección antes de marcar el pago', crear('socio1', msj(), { de: 'socio', tipo: 'llegada', texto: 'llegada' }), false);
await espera('socio dueño marca pago recibido directo (lo hace el servidor)', act('socio1', { estado: 'pagada' }), false);
await espera('administrador marca pago recibido (camino del administrador)', act('admin1', { estado: 'pagada' }), true);
await espera('socio cancela después de recibir el pago', act('socio1', { estado: 'cancelada' }), false);
await espera('socio regresa una pagada a confirmada', act('socio1', { estado: 'confirmada' }), false);
await espera('socio manda los datos de llegada directo (los manda el servidor)', crear('socio1', msj(), { de: 'socio', tipo: 'llegada', texto: 'llegada' }), false);
await espera('socio mete su teléfono en «llegada»', crear('socio1', msj(), { de: 'socio', tipo: 'llegada', texto: 'Llamame 5555 0001' }), false);
await espera('cliente manda «llegada»', crear(null, msj(), { de: 'cliente', tipo: 'llegada', texto: 'llegada' }), false);
const foto = (t) => `https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/chats%2F${t}%2Fabc123.jpeg?alt=media&token=1a2b-3c4d`;
// Dirección y mapa de la casa: privados (properties/{id}/privado/llegada); viajan en el mensaje, idénticos a lo guardado
{
	const PRIV = 'properties/prueba-casa-playa-monterrico/privado/llegada';
	const dir = { direccion: 'Calle Real 12, Monterrico', mapa: 'https://maps.google.com/?q=13.8912,-90.4801' };
	const escribir = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `projects/demo-eq/databases/(default)/documents/${ruta}`, fields: campos(o) } }] }) }).then((r) => r.status);
	const llegada = (de, extra) => ({ de, tipo: 'llegada', texto: 'llegada', ...extra });
	await espera('administrador guarda la dirección privada', escribir('admin1', PRIV, dir), true);
	await espera('anónimo lee la dirección privada', leer(null, PRIV), false);
	await espera('otro socio lee la dirección privada', leer('socio2', PRIV), false);
	await poner('users/asesor9', { rol: 'asesor', activo: true, agentId: 'a9', nombre: 'Asesor de otra casa' });
	await espera('asesor de otra casa lee la dirección privada', leer('asesor9', PRIV), false);
	await espera('equipo manda «llegada» con otra dirección', crear('admin1', msj(), llegada('equipo', { ...dir, direccion: 'Otra calle 5' })), false);
	await espera('cliente adjunta una foto con una dirección', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: foto(T), direccion: 'x' }), false);
	await espera('socio dueño lee la dirección privada de su casa', leer('socio1', PRIV), true);
	await espera('socio dueño cambia la dirección privada', escribir('socio1', PRIV, { ...dir, direccion: 'Llamame 5555 0001' }), false);
	await espera('socio manda «llegada» sin la dirección guardada', crear('socio1', msj(), llegada('socio')), false);
	await espera('socio manda «llegada» con otra dirección', crear('socio1', msj(), llegada('socio', { ...dir, direccion: 'Calle Real 12. Llamame 5555 0001' })), false);
	await espera('socio manda «llegada» con otro mapa', crear('socio1', msj(), llegada('socio', { ...dir, mapa: 'https://wa.me/50255550001' })), false);
	await espera('socio manda «llegada» solo con la dirección', crear('socio1', msj(), llegada('socio', { direccion: dir.direccion })), false);
	await espera('cliente manda «llegada» con la dirección', crear(null, msj(), llegada('cliente', dir)), false);
	await espera('socio manda «llegada» con la dirección y el mapa guardados, directo (lo hace el servidor)', crear('socio1', msj(), llegada('socio', dir)), false);
	await espera('equipo manda «llegada» con la dirección y el mapa guardados (camino del administrador)', crear('admin1', msj(), llegada('equipo', dir)), true);
	await espera('socio mete una dirección en un mensaje normal', crear('socio1', msj(), { ...m('socio', 'Nos vemos'), direccion: 'Calle Real 12' }), false);
	await espera('socio mete un mapa en los datos de pago', crear('socio1', msj(), { ...pago('socio', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno'), mapa: 'x' }), false);
	await espera('cliente mete una dirección en su mensaje', crear(null, msj(), { ...m('cliente', 'Hola'), direccion: 'x' }), false);
}
// Acuerdo con el dueño de cada inmueble (exclusiva, comisión, impuestos): privado; solo el administrador y el asesor de esa casa
{
	const escribir = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `projects/demo-eq/databases/(default)/documents/${ruta}`, fields: campos(o) } }] }) }).then((r) => r.status);
	await poner('users/asesor7', { rol: 'asesor', activo: true, agentId: 'a7', nombre: 'Asesor de la casa en venta' });
	await poner('properties/prueba-casa-en-venta', { titulo: 'Casa en venta (prueba)', operacion: 'venta', publicado: true, agentId: 'a7', propietarioId: 'o2' });
	const ACUERDO = 'properties/prueba-casa-en-venta/privado/acuerdo';
	const acuerdo = { exclusiva: true, exclusivaFin: '2027-01-31', comisionPct: 4, impuestoVenta: 'iva' };
	await espera('asesor de la casa guarda el acuerdo con el dueño', escribir('asesor7', ACUERDO, acuerdo), true);
	await espera('asesor de la casa lee el acuerdo', leer('asesor7', ACUERDO), true);
	await espera('administrador lee el acuerdo', leer('admin1', ACUERDO), true);
	await espera('anónimo lee el acuerdo de una casa publicada', leer(null, ACUERDO), false);
	await espera('asesor de otra casa lee el acuerdo', leer('asesor9', ACUERDO), false);
	await espera('asesor de otra casa cambia el acuerdo', escribir('asesor9', ACUERDO, { ...acuerdo, comisionPct: 1 }), false);
	await espera('socio dueño de la casa lee el acuerdo', leer('socio2', ACUERDO), false);
	await espera('socio dueño de la casa cambia el acuerdo', escribir('socio2', ACUERDO, { ...acuerdo, comisionPct: 0 }), false);
	await espera('socio lee el acuerdo de su casa por noche', leer('socio1', 'properties/prueba-casa-playa-monterrico/privado/acuerdo'), false);
	// Al eliminar la casa (eliminarPropiedad), lo que escribe el servidor también se borra: la llave del calendario de EQ y
	// lo último leído de Airbnb/Booking/VRBO. El socio no.
	const borrar = (quien, ruta) => fetch(`${H}/${ruta}`, { method: 'DELETE', headers: cab(quien) }).then((r) => r.status);
	for (const d of ['calendario', 'icalLeido']) {
		await poner(`properties/prueba-casa-playa-monterrico/privado/${d}`, { x: 1 });
		await espera(`socio borra privado/${d} de su casa por noche`, borrar('socio1', `properties/prueba-casa-playa-monterrico/privado/${d}`), false);
		await espera(`administrador borra privado/${d} al eliminar la casa`, borrar('admin1', `properties/prueba-casa-playa-monterrico/privado/${d}`), true);
	}
}
await espera('cliente adjunta la foto de su comprobante', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: foto(T) }), true);
// Con la foto, el cliente marca en el chat «adjuntó su comprobante» (hora del servidor): desde ahí el socio no cancela solo.
{
	// La marca nombra la foto (comprobanteMensaje), que nace en el mismo lote (js/reserva-chat.js guardarMensaje).
	const B = 'projects/demo-eq/databases/(default)/documents';
	const fotoMsj = (id, de = 'cliente') => ({ update: { name: `${B}/chats/${T}/mensajes/${id}`, fields: campos({ de, tipo: 'foto', texto: foto(T) }) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
	const marca = (id, extra = {}) => ({ update: { name: `${B}/chats/${T}`, fields: campos({ comprobanteMensaje: id }) }, updateMask: { fieldPaths: ['comprobanteMensaje'] }, currentDocument: { exists: true }, updateTransforms: [{ fieldPath: 'comprobanteCliente', setToServerValue: 'REQUEST_TIME' }], ...extra });
	const lote = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
	// El comprobante se manda con la reserva confirmada (antes del pago recibido): el chat vuelve a ese estado y después a «pagada».
	const estadoDeT = (estado) => fetch(`${H}/chats/${T}?updateMask.fieldPaths=estado`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: campos({ estado }) }) });
	await estadoDeT('confirmada');
	await espera('cliente marca su comprobante sin mandar la foto', lote(null, [marca('no-existe')]), false);
	await espera('cliente marca su comprobante con una foto de antes', lote(null, [marca('m1')]), false);
	await espera('socio marca el comprobante del cliente', lote('socio1', [fotoMsj('fs1', 'socio'), marca('fs1')]), false);
	await espera('cliente pone el comprobante con una fecha vieja (para borrarlo)', lote(null, [fotoMsj('fc0'), { update: { name: `${B}/chats/${T}`, fields: { comprobanteMensaje: val('fc0'), comprobanteCliente: { timestampValue: '2000-01-01T00:00:00Z' } } }, updateMask: { fieldPaths: ['comprobanteMensaje', 'comprobanteCliente'] } }]), false);
	await espera('cliente manda su foto y marca su comprobante en el mismo lote (control)', lote(null, [fotoMsj('fc1'), marca('fc1')]), true);
	await estadoDeT('pagada');
}
// El comprobante del cliente solo con la reserva confirmada: con el chat pendiente, la marca apagaría la cancelación
// sola y la del socio en cuanto se confirmara.
{
	const B = 'projects/demo-eq/databases/(default)/documents';
	const lote = (writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes }) }).then((r) => r.status);
	const conEstado = async (TP, estado) => {
		await poner(`chats/${TP}`, { ...chat, leadId: 'lead-cp', codigo: 'EQ-CP', ...(estado ? { estado } : {}) });
		return lote([
			{ update: { name: `${B}/chats/${TP}/mensajes/fp1`, fields: campos({ de: 'cliente', tipo: 'foto', texto: foto(TP) }) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
			{ update: { name: `${B}/chats/${TP}`, fields: campos({ comprobanteMensaje: 'fp1' }) }, updateMask: { fieldPaths: ['comprobanteMensaje'] }, currentDocument: { exists: true }, updateTransforms: [{ fieldPath: 'comprobanteCliente', setToServerValue: 'REQUEST_TIME' }] }]);
	};
	await espera('cliente marca su comprobante con la solicitud sin responder', conEstado('TokenComprobantePendienteLargo1', ''), false);
	await espera('cliente marca su comprobante en una solicitud que no se dio', conEstado('TokenComprobanteNoSeDioLargo12', 'no'), false);
	await espera('cliente marca su comprobante con el pago ya recibido', conEstado('TokenComprobanteYaPagadaLargo12', 'pagada'), false);
	await espera('cliente marca su comprobante con la reserva confirmada (control)', conEstado('TokenComprobanteConfirmadaLarg1', 'confirmada'), true);
}
await espera('cliente manda como foto un enlace de otro sitio', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: 'https://ejemplo.com/foto.jpg' }), false);
await espera('cliente manda una foto de otra reserva', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: foto('OtroTokenLargoYAlAzar23456789') }), false);
await espera('socio manda una foto', crear('socio1', msj(), { de: 'socio', tipo: 'foto', texto: foto(T) }), false);
// Reserva cancelada por el administrador: el socio ya no escribe ni la revive
await espera('administrador cancela', act('admin1', { estado: 'cancelada' }), true);
await espera('socio escribe en una reserva cancelada', crear('socio1', msj(), m('socio', 'La casa queda en Calle Real 12')), false);
await espera('socio revive una cancelada', act('socio1', { estado: 'confirmada' }), false);
await espera('equipo sí escribe en una cancelada', crear('admin1', msj(), m('equipo', 'Lamentamos la cancelación.')), true);
// Lotes: dentro de un mismo lote las reglas ven el estado ANTERIOR. Ningún lote del socio que confirma o cobra pasa
// (lo hace el servidor); «Confirmar» del administrador (estado + datos de pago) sí.
{
	const R = 'projects/demo-eq/databases/(default)/documents';
	const L = 'TokenLoteDePruebaLargo123456';
	// (El chat es de lead1, que ya tiene su reserva confirmada.)
	const lote = async (estadoAntes, writes, leadId = 'lead1', quien = 'socio1') => {
		await fetch(`${H}/chats/${L}`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: campos({ propietarioId: 'o1', propertyId: 'prueba-casa-playa-monterrico', codigo: 'EQ-L', leadId, ...(estadoAntes ? { estado: estadoAntes } : {}) }) }) });
		return fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((x) => x.status);
	};
	const estado = (v) => ({ update: { name: `${R}/chats/${L}`, fields: campos({ estado: v }) }, updateMask: { fieldPaths: ['estado'] }, currentDocument: { exists: true } });
	const mensaje = (id, f) => ({ update: { name: `${R}/chats/${L}/mensajes/${id}`, fields: campos(f) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
	await espera('lote «pago recibido» (estado + llegada juntos)', lote('confirmada', [estado('pagada'), mensaje('l1', { de: 'socio', tipo: 'llegada', texto: 'llegada' })]), false);
	await espera('lote «pago recibido» con la dirección correcta, junto al estado', lote('confirmada', [estado('pagada'), mensaje('l2', { de: 'socio', tipo: 'llegada', texto: 'llegada', direccion: 'Calle Real 12, Monterrico', mapa: 'https://maps.google.com/?q=13.8912,-90.4801' })]), false);
	await espera('lote «confirmar» sin reserva (cobra sin comisión registrada)', lote('', [estado('confirmada'), mensaje('p0', { de: 'socio', tipo: 'pago', texto: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno' })], 'solicitud-sin-reserva'), false);
	await espera('lote «confirmar» del socio (estado + datos de pago juntos)', lote('', [estado('confirmada'), mensaje('p1', { de: 'socio', tipo: 'pago', texto: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno' })]), false);
	await espera('lote «confirmar» del administrador (estado + datos de pago juntos)', lote('', [estado('confirmada'), mensaje('p2', { de: 'equipo', tipo: 'pago', texto: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno' })], 'lead1', 'admin1'), true);
}
// Un solo panel por dueño: una persona con una casa en venta y otra por noche (y un colaborador). Su resumen
// (portalPropietarios) lo lee solo esa persona con su usuario; la venta la lleva el equipo; la de por noche, ella.
{
	const R = 'projects/demo-eq/databases/(default)/documents';
	const raw = (ruta, fields) => fetch(`${H}/${ruta}`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields }) });
	const sv = (v) => ({ stringValue: v });
	await poner('users/mixto1', { rol: 'socio', activo: true, propietarioId: 'm1', nombre: 'Dueña mixta' });
	await poner('users/colab1', { rol: 'socio', activo: true, propietarioId: 'c1', nombre: 'Colaborador' });
	await poner('users/apagado1', { rol: 'socio', activo: false, propietarioId: 'm1', nombre: 'Acceso quitado' });
	await poner('propietarios/m1', { nombre: 'Dueña mixta', agentId: 'a7', notas: 'Nota interna', datosPago: 'Banco 1' });
	await poner('propietarios/c1', { nombre: 'Colaborador', tipo: 'colaborador', agentId: 'a7' });
	await raw('properties/mx-venta', { titulo: sv('Casa en venta de la dueña mixta'), operacion: sv('venta'), propietarioId: sv('m1'), agentId: sv('a7'), publicado: { booleanValue: false }, precio: { doubleValue: 150000 } });
	await raw('properties/mx-noche', { titulo: sv('Casa por noche de la dueña mixta'), operacion: sv('vacacional'), propietarioId: sv('m1'), publicado: { booleanValue: true }, precio: { doubleValue: 120 }, vacacional: { mapValue: { fields: { base: { doubleValue: 120 } } } } });
	await raw('properties/cx-venta', { titulo: sv('Casa del colaborador'), operacion: sv('venta'), propietarioId: sv('c1'), agentId: sv('a7'), publicado: { booleanValue: true } });
	await poner('properties/mx-venta/privado/acuerdo', { exclusiva: true, exclusivaFin: '2027-02-01', comisionPct: 5 });
	await poner('properties/mx-venta/privado/socio', { precioBase: 1 });
	await poner('properties/mx-noche/privado/socio', { precioBase: 100 });
	await poner('properties/mx-noche/privado/acuerdo', { exclusiva: false });
	const TM = 'ResumenDeLaDuenaMixtaLargoYAlAzar1234', TC = 'ResumenDelColaboradorLargoYAlAzar12345', TO = 'ResumenDeOtroDuenoLargoYAlAzar12345678';
	await poner(`portalPropietarios/${TM}`, { propietarioId: 'm1', agentId: 'a7', email: 'mixta@example.com', datosPago: 'Banco 1', tipo: 'propietario' });
	await poner(`portalPropietarios/${TC}`, { propietarioId: 'c1', agentId: 'a7', email: 'colab@example.com', tipo: 'colaborador' });
	await poner(`portalPropietarios/${TO}`, { propietarioId: 'o2', agentId: 'a1', email: 'otro@example.com', datosPago: 'Banrural 9988776655' });
	const parche = (quien, ruta, campos, fields) => fetch(`${H}/${ruta}?${campos.map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: cab(quien), body: JSON.stringify({ fields }) }).then((r) => r.status);
	const comentario = (quien, id, f) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/comentariosPropietarios/${id}`, fields: campos(f) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'fecha', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
	const com = (token, propietarioId, agentId, propiedadId, extra = {}) => ({ token, propietarioId, agentId, propiedadId, tipo: 'aprobado', texto: '', origen: 'propietario', ...extra });
	await espera('dueña mixta lee su resumen', leer('mixto1', `portalPropietarios/${TM}`), true);
	await espera('dueña mixta busca su resumen por su ficha', consulta('mixto1', 'portalPropietarios', 'propietarioId', 'm1'), true);
	await espera('dueña mixta lee el resumen de otro dueño', leer('mixto1', `portalPropietarios/${TO}`), false);
	await espera('dueña mixta busca el resumen de otro dueño', consulta('mixto1', 'portalPropietarios', 'propietarioId', 'o2'), false);
	await espera('anónimo abre un resumen con su id (el enlace de antes)', leer(null, `portalPropietarios/${TM}`), false);
	await espera('anónimo busca resúmenes por correo (el acceso por correo de antes)', consulta(null, 'portalPropietarios', 'email', 'mixta@example.com'), false);
	await espera('dueña mixta lee su propia ficha (notas internas)', leer('mixto1', 'propietarios/m1'), false);
	await espera('dueña mixta lista sus casas (venta y por noche)', consulta('mixto1', 'properties', 'propietarioId', 'm1'), true);
	await espera('dueña mixta cambia el precio de su casa en venta', parche('mixto1', 'properties/mx-venta', ['precio'], { precio: { doubleValue: 1 } }), false);
	// Sus precios (privado/socio) y los públicos van juntos y cuadran con el margen (20 %): «Mis propiedades» los
	// escribe en una transacción. El panel guarda los enteros como enteros: se prueban los dos.
	{
		const num = (x) => (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x });
		const mapa = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, Array.isArray(x) ? { arrayValue: { values: x.map(mapa) } } : typeof x === 'number' ? num(x) : sv(x)])) } });
		const casa = (vac, extra = {}) => ({ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: mapa(vac), ...extra } }, updateMask: { fieldPaths: [...Object.keys(vac).map((k) => `vacacional.${k}`), ...Object.keys(extra)] } });
		const suyo = (o) => ({ update: { name: `${R}/properties/mx-noche/privado/socio`, fields: mapa(o).mapValue.fields }, updateMask: { fieldPaths: Object.keys(o) } });
		const soloJuntos = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
		const juntos = async (quien, writes) => soloJuntos(quien, await conRenglon(quien, writes));
		await espera('dueña sube su precio sin su renglón en la bitácora', soloJuntos('mixto1', [suyo({ precioBase: 110 }), casa({ base: 132 }, { precio: num(132) })]), false);
		await espera('dueña sube su precio con otro «antes» en la bitácora', soloJuntos('mixto1', await conRenglon('mixto1', [suyo({ precioBase: 110 }), casa({ base: 132 }, { precio: num(132) })], { antesOtro: fotoCasaRaw({ propietarioId: sv('m1') }, { precioBase: { integerValue: '1' } }) })), false);
		await espera('dueña cambia solo el precio público de su casa por noche', parche('mixto1', 'properties/mx-noche', ['precio', 'vacacional.base'], { precio: { doubleValue: 130 }, vacacional: { mapValue: { fields: { base: { doubleValue: 130 } } } } }), false);
		await espera('dueña baja solo su precio (el público queda igual)', juntos('mixto1', [suyo({ precioBase: 50 })]), false);
		await espera('dueña quita el margen: público igual a su precio', juntos('mixto1', [suyo({ precioBase: 110 }), casa({ base: 110 }, { precio: num(110) })]), false);
		await espera('dueña sube su precio y el público juntos (control)', juntos('mixto1', [suyo({ precioBase: 110 }), casa({ base: 132 }, { precio: num(132) })]), true);
		await espera('dueña vuelve a su precio con decimales (control)', juntos('mixto1', [suyo({ precioBase: 100.5 }), casa({ base: 120.6 })]), true);
		await espera('dueña vuelve a su precio en enteros (control)', juntos('mixto1', [suyo({ precioBase: 100 }), casa({ base: 120 })]), true);
		await espera('dueña pone fin de semana público sin el suyo', juntos('mixto1', [casa({ finde: 150 })]), false);
		await espera('dueña pone su fin de semana y el público (control)', juntos('mixto1', [suyo({ precioFinde: 125 }), casa({ finde: 150 })]), true);
		const t = (precio) => ({ desde: '2026-12-20', hasta: '2026-12-31', precio });
		await espera('dueña pone un precio por fechas público sin margen', juntos('mixto1', [suyo({ tarifas: [t(80)] }), casa({ tarifas: [t(80)] })]), false);
		await espera('dueña pone un precio por fechas solo en el suyo', juntos('mixto1', [suyo({ tarifas: [t(80)] })]), false);
		await espera('dueña pone dos precios por fechas suyos y uno público', juntos('mixto1', [suyo({ tarifas: [t(80), { ...t(70), desde: '2027-01-02', hasta: '2027-01-05' }] }), casa({ tarifas: [t(96)] })]), false);
		await espera('dueña pone un precio por fechas con otras fechas en el público', juntos('mixto1', [suyo({ tarifas: [t(80)] }), casa({ tarifas: [{ ...t(96), hasta: '2027-03-31' }] })]), false);
		await espera('dueña pone un precio por fechas con su margen (control)', juntos('mixto1', [suyo({ tarifas: [t(80)] }), casa({ tarifas: [t(96)] })]), true);
		const diez = Array.from({ length: 10 }, (_, k) => ({ desde: `2027-${String(k + 1).padStart(2, '0')}-01`, hasta: `2027-${String(k + 1).padStart(2, '0')}-05`, precio: 90 + k }));
		const conMargen = (lista) => lista.map((x) => ({ ...x, precio: Math.round(x.precio * 120) / 100 }));
		await espera('dueña pone 10 precios por fechas, cada uno con su margen (control)', juntos('mixto1', [suyo({ tarifas: diez }), casa({ tarifas: conMargen(diez) })]), true);
		await espera('dueña pone 11 precios por fechas', juntos('mixto1', [suyo({ tarifas: [...diez, t(80)] }), casa({ tarifas: conMargen([...diez, t(80)]) })]), false);
		await raw('properties/mx-noche-sin-precio', { titulo: sv('Casa por noche sin precio del dueño'), operacion: sv('vacacional'), propietarioId: sv('m1'), publicado: { booleanValue: false }, vacacional: { mapValue: { fields: { base: { integerValue: '0' } } } } });
		await espera('dueña bloquea días de una casa que aún no tiene su precio en privado (control)', parche('mixto1', 'properties/mx-noche-sin-precio', ['vacacional.bloqueos'], { vacacional: { mapValue: { fields: { bloqueos: { arrayValue: { values: [] } } } } } }), true);
		await espera('dueña bloquea días sin tocar precios (control)', parche('mixto1', 'properties/mx-noche', ['vacacional.bloqueos'], { vacacional: { mapValue: { fields: { bloqueos: { arrayValue: { values: [] } } } } } }), true);
		await espera('dueña se cambia el margen de su casa', juntos('mixto1', [suyo({ margen: 0 })]), false);
		// Su calendario con topes: personas 1 a 50, mínimos de 1 a 30 noches (hasta 10), hasta 15 grupos de días bloqueados.
		const diaN = (k) => new Date(Date.UTC(2027, 0, 1) + k * 86400000).toISOString().slice(0, 10);
		const bloqueos = (n) => Array.from({ length: n }, (_, k) => ({ desde: diaN(3 * k), hasta: diaN(3 * k + 2) }));
		const minimos = (n, noches = 3) => Array.from({ length: n }, (_, k) => ({ desde: diaN(3 * k), hasta: diaN(3 * k + 1), noches }));
		await espera('dueña pone 51 personas máximo', juntos('mixto1', [casa({ huespedesMax: 51 })]), false);
		await espera('dueña pone 2.5 personas máximo', juntos('mixto1', [casa({ huespedesMax: 2.5 })]), false);
		await espera('dueña pone 50 personas máximo (control)', juntos('mixto1', [casa({ huespedesMax: 50 })]), true);
		await espera('dueña pone un mínimo de 365 noches', juntos('mixto1', [casa({ minimos: minimos(1, 365) })]), false);
		await espera('dueña pone un mínimo de 0 noches', juntos('mixto1', [casa({ minimos: minimos(1, 0) })]), false);
		await espera('dueña pone 11 mínimos de noches', juntos('mixto1', [casa({ minimos: minimos(11) })]), false);
		await espera('dueña pone 10 mínimos de 30 noches (control)', juntos('mixto1', [casa({ minimos: minimos(10, 30) })]), true);
		// «Faltan tus temporadas» pone precios y mínimos de un toque: el caso más grande junto (10 y 10) cabe en las reglas.
		await espera('dueña pone 10 precios por fechas y 10 mínimos en un solo cambio (control)', juntos('mixto1', [suyo({ tarifas: diez }), casa({ tarifas: conMargen(diez), minimos: minimos(10, 3) })]), true);
		await espera('dueña bloquea hasta dentro de 5 años', juntos('mixto1', [casa({ bloqueos: [{ desde: '2027-01-01', hasta: `${new Date().getUTCFullYear() + 5}-01-01` }] })]), false);
		await espera('dueña bloquea con la salida antes de la llegada', juntos('mixto1', [casa({ bloqueos: [{ desde: '2027-02-10', hasta: '2027-02-01' }] })]), false);
		await espera('dueña bloquea con una fecha mal escrita', juntos('mixto1', [casa({ bloqueos: [{ desde: 'mañana', hasta: '2027-02-01' }] })]), false);
		await espera('dueña bloquea en el año 2099', juntos('mixto1', [casa({ bloqueos: [{ desde: '2099-01-01', hasta: '2099-01-05' }] })]), false);
		await espera('dueña bloquea 16 grupos de días', juntos('mixto1', [casa({ bloqueos: bloqueos(16) })]), false);
		await espera('dueña bloquea 15 grupos de días (el caso más grande, control)', juntos('mixto1', [casa({ bloqueos: bloqueos(15) })]), true);
		// Una casa con más de los que caben (de antes): solo quita.
		await fetch(`${H}/properties/mx-noche?updateMask.fieldPaths=vacacional.bloqueos`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { vacacional: mapa({ bloqueos: bloqueos(20) }) } }) });
		await espera('con 20 grupos de antes, dueña agrega otro', juntos('mixto1', [casa({ bloqueos: [...bloqueos(20), { desde: '2027-12-20', hasta: '2027-12-22' }] })]), false);
		await espera('con 20 grupos de antes, dueña quita uno (control)', juntos('mixto1', [casa({ bloqueos: bloqueos(20).slice(1) })]), true);
		await espera('dueña deja sus días bloqueados en 15 (control)', juntos('mixto1', [casa({ bloqueos: bloqueos(15) })]), true);
		// Permisos del socio (permisosSocios/{propietarioId}): lo apagado no se cambia; lo demás sí.
		// Cada vez otro día (si el valor no cambia, no cuenta como cambio).
		let dia = 1;
		const bloquear = () => juntos('mixto1', [casa({ bloqueos: [{ desde: `2027-05-${String(dia).padStart(2, '0')}`, hasta: `2027-05-${String(++dia).padStart(2, '0')}` }] })]);
		const subir = () => juntos('mixto1', [suyo({ precioBase: 110 }), casa({ base: 132 }, { precio: num(132) })]);
		await poner('permisosSocios/m1', { precios: false, fechas: true, casa: true, motivo: 'propio' });
		await espera('precios apagados: la dueña no cambia su precio', subir(), false);
		await espera('precios apagados: no cambia las personas máximo', parche('mixto1', 'properties/mx-noche', ['vacacional.huespedesMax'], { vacacional: { mapValue: { fields: { huespedesMax: { integerValue: '9' } } } } }), false);
		await espera('precios apagados: no cambia solo el precio de los listados', parche('mixto1', 'properties/mx-noche', ['precio'], { precio: { doubleValue: 77 } }), false);
		await espera('precios apagados: sí bloquea días (control)', bloquear(), true);
		await poner('permisosSocios/m1', { precios: true, fechas: false, casa: true, motivo: 'atraso' });
		await espera('fechas apagadas: la dueña no bloquea días', bloquear(), false);
		await espera('fechas apagadas: sí cambia su precio (control)', subir(), true);
		await espera('la dueña lee sus permisos', leer('mixto1', 'permisosSocios/m1'), true);
		await espera('la dueña se devuelve los permisos', parche('mixto1', 'permisosSocios/m1', ['fechas'], { fechas: { booleanValue: true } }), false);
		await espera('otro socio lee los permisos de la dueña', leer('socio2', 'permisosSocios/m1'), false);
		await espera('la dueña lee los permisos para todos', leer('mixto1', 'settings/permisosSocios'), false);
		await espera('el administrador apaga un permiso para todos sin su renglón', parche('admin1', 'settings/permisosSocios', ['precios'], { precios: { booleanValue: false } }), false);
		{
			const foto = (p) => ({ mapValue: { fields: { precios: { booleanValue: p }, fechas: { booleanValue: true }, casa: { booleanValue: true } } } });
			await espera('el administrador apaga un permiso para todos, con su renglón (control)', soloJuntos('admin1', [
				{ update: { name: `${R}/settings/permisosSocios`, fields: { precios: { booleanValue: false }, bitacoraId: sv('glob1') } }, updateMask: { fieldPaths: ['precios', 'bitacoraId'] } },
				{ update: { name: `${R}/bitacora/glob1`, fields: { tipo: sv('permisos'), objeto: sv('permisosSocios'), antes: foto(true), despues: foto(false), quien: sv('admin1'), nombre: sv('Admin') } }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] }]), true);
		}
		await fetch(`${H}/permisosSocios/m1`, { method: 'DELETE', headers: cab('dueño') });
		await fetch(`${H}/settings/permisosSocios`, { method: 'DELETE', headers: cab('dueño') });
		await espera('sin documento de permisos: bloquea días (control)', bloquear(), true);
	}
	await espera('dueña mixta convierte su casa por noche en venta', parche('mixto1', 'properties/mx-noche', ['operacion'], { operacion: sv('venta') }), false);
	await espera('dueña mixta lee el acuerdo de su casa en venta', leer('mixto1', 'properties/mx-venta/privado/acuerdo'), false);
	await espera('dueña mixta lee el acuerdo de su casa por noche', leer('mixto1', 'properties/mx-noche/privado/acuerdo'), false);
	await espera('dueña mixta lee el privado de socio de su casa en venta', leer('mixto1', 'properties/mx-venta/privado/socio'), false);
	await espera('dueña mixta lee su precio de socio de la casa por noche', leer('mixto1', 'properties/mx-noche/privado/socio'), true);
	await espera('dueña mixta lee la bitácora de su casa en venta', leer('mixto1', 'properties/mx-venta/bitacora'), false);
	await espera('dueña mixta lista leads de sus casas', consulta('mixto1', 'leads', 'propietarioId', 'm1'), false);
	await espera('dueña mixta lista clientes', consulta('mixto1', 'clientes'), false);
	await espera('dueña mixta lee un lead', leer('mixto1', 'leads/lead1'), false);
	await espera('dueña mixta aprueba el anuncio de su casa', comentario('mixto1', 'c1', com(TM, 'm1', 'a7', 'mx-venta')), true);
	await espera('dueña mixta pide cambios sin texto', comentario('mixto1', 'c2', com(TM, 'm1', 'a7', 'mx-venta', { tipo: 'cambios' })), false);
	await espera('dueña mixta comenta a nombre de otro dueño', comentario('mixto1', 'c3', com(TO, 'o2', 'a1', 'prueba-casa-en-venta')), false);
	await espera('dueña mixta comenta una casa ajena con su resumen', comentario('mixto1', 'c4', com(TM, 'm1', 'a7', 'prueba-casa-en-venta')), false);
	await espera('anónimo comenta con el id del resumen', comentario(null, 'c5', com(TM, 'm1', 'a7', 'mx-venta')), false);
	await espera('acceso quitado: no lee su resumen', leer('apagado1', `portalPropietarios/${TM}`), false);
	await espera('acceso quitado: no cambia el precio por noche', parche('apagado1', 'properties/mx-noche', ['precio', 'vacacional.base'], { precio: { doubleValue: 99 }, vacacional: { mapValue: { fields: { base: { doubleValue: 99 } } } } }), false);
	await espera('acceso quitado: no comenta', comentario('apagado1', 'c6', com(TM, 'm1', 'a7', 'mx-venta')), false);
	await espera('colaborador lee su resumen', leer('colab1', `portalPropietarios/${TC}`), true);
	await espera('colaborador lee el resumen de la dueña mixta', leer('colab1', `portalPropietarios/${TM}`), false);
	await espera('colaborador lista solo sus casas', consulta('colab1', 'properties', 'propietarioId', 'c1'), true);
	await espera('colaborador lista las casas de la dueña mixta', consulta('colab1', 'properties', 'propietarioId', 'm1'), false);
	await espera('colaborador lee su ficha', leer('colab1', 'propietarios/c1'), false);
	await espera('administrador lee el resumen', leer('admin1', `portalPropietarios/${TM}`), true);
	await espera('asesor de otra cartera lee el resumen', leer('asesor9', `portalPropietarios/${TM}`), false);
	// Lo que alguien haría para saltarse la pantalla
	await espera('dueña se cambia el rol a administradora', parche('mixto1', 'users/mixto1', ['rol'], { rol: sv('admin') }), false);
	await espera('dueña se cambia de ficha (propietarioId)', parche('mixto1', 'users/mixto1', ['propietarioId'], { propietarioId: sv('o2') }), false);
	await espera('acceso quitado se reactiva solo', parche('apagado1', 'users/apagado1', ['activo'], { activo: { booleanValue: true } }), false);
	await espera('dueña lista todos los resúmenes (sin filtro)', consulta('mixto1', 'portalPropietarios'), false);
	await espera('dueña cambia su resumen', parche('mixto1', `portalPropietarios/${TM}`, ['datosPago'], { datosPago: sv('Mi WhatsApp 5555 0001') }), false);
	await espera('dueña borra su resumen', fetch(`${H}/portalPropietarios/${TM}`, { method: 'DELETE', headers: cab('mixto1') }).then((r) => r.status), false);
	await poner('properties/mx-venta/privado/llegada', { direccion: 'Calle de la casa en venta 1', mapa: 'https://maps.google.com/?q=1,1' });
	await espera('dueña lee la «llegada» privada de su casa en venta', leer('mixto1', 'properties/mx-venta/privado/llegada'), false);
	await espera('dueña cambia el dueño de su casa por noche', parche('mixto1', 'properties/mx-noche', ['propietarioId'], { propietarioId: sv('o2') }), false);
	await espera('comentario con un campo de más', comentario('mixto1', 'c7', { ...com(TM, 'm1', 'a7', 'mx-venta'), telefono: '55550001' }), false);
	await espera('pedir cambios con más de 2000 caracteres', comentario('mixto1', 'c8', com(TM, 'm1', 'a7', 'mx-venta', { tipo: 'cambios', texto: 'x'.repeat(2001) })), false);
	await raw('properties/mx-lista', { titulo: sv('Casa enlazada solo en su lista'), operacion: sv('venta'), propietarioId: sv(''), publicado: { booleanValue: true } });
	await espera('comentario de una casa enlazada solo en su lista (no dice ser suya)', comentario('mixto1', 'c9', com(TM, 'm1', 'a7', 'mx-lista')), false);
	await espera('dueña pide cambios con texto (control)', comentario('mixto1', 'c10', com(TM, 'm1', 'a7', 'mx-venta', { tipo: 'cambios', texto: 'Cambiar la foto de la sala' })), true);
	// Reservas, solicitudes y chat: solo de casas por noche
	await espera('dueña crea una reserva de su casa en venta', crear('mixto1', 'reservas/r-venta', { propertyId: 'mx-venta', propietarioId: 'm1', estado: 'confirmada' }), false);
	// La reserva de una solicitud: la crea el servidor por el socio (netlify/functions/reservas.mjs) o el administrador en el
	// panel; el socio por escritura directa, no (ni con los montos que pedía la regla de antes).
	const vv = (v) => (v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, vv(x)])) } } : val(v));
	const crearR = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/${ruta}`, fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, vv(x)])) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
	// Lo mismo sin la condición de «no existe»: como lo hace la app (set), que sobre una reserva que ya existe es un cambio.
	const escribirR = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/${ruta}`, fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, vv(x)])) }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
	await raw('leads/lead-res-noche', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1'), reserva: { mapValue: { fields: { codigo: sv('EQ-RN'), llegada: sv('2026-12-01'), salida: sv('2026-12-04'), noches: { integerValue: '3' }, subtotal: { doubleValue: 360 }, moneda: sv('USD') } } } });
	const delSocio = (extra = {}, comision = {}) => ({ propertyId: 'mx-noche', propertyTitulo: 'Casa por noche', agentId: '', propietarioId: 'm1', moneda: 'USD', llegada: '2026-12-01', salida: '2026-12-04', noches: 3,
		huesped: 'Ana', canal: 'web', estado: 'confirmada', leadId: 'lead-res-noche', codigo: 'EQ-RN', chat: 'ChatDeLaReservaRNLargoYAlAzar1', costoSocio: 300, alojamiento: 360, ganancia: 60, pagadoSocio: false, pagadoFecha: '',
		...extra, comision: { monto: extra.ganancia ?? 60, vence: '2026-12-01', pagada: false, ...comision } });
	await raw('chats/ChatDeLaReservaRNLargoYAlAzar1', { leadId: sv('lead-res-noche'), codigo: sv('EQ-RN'), propietarioId: sv('m1'), propertyId: sv('mx-noche') });
	await raw('chats/ChatDeLaReservaRN2LargoYAlAzar', { leadId: sv('lead-res-noche2'), codigo: sv('EQ-RN2'), propietarioId: sv('m1'), propertyId: sv('mx-noche') });
	await raw('chatsPorSolicitud/lead-res-noche', { token: sv('ChatDeLaReservaRNLargoYAlAzar1') });
	// Una solicitud cotizada en US$ 500 de alojamiento: confirmar por 360 (un precio especial puesto después) no pasa.
	await raw('leads/lead-res-cara', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1'), reserva: { mapValue: { fields: { codigo: sv('EQ-RC'), llegada: sv('2026-12-01'), salida: sv('2026-12-04'), noches: { integerValue: '3' }, subtotal: { doubleValue: 500 }, moneda: sv('USD') } } } });
	await raw('chats/ChatDeLaReservaCaraLargoAlAzar2', { leadId: sv('lead-res-cara'), codigo: sv('EQ-RC'), propietarioId: sv('m1'), propertyId: sv('mx-noche') });
	await raw('chatsPorSolicitud/lead-res-cara', { token: sv('ChatDeLaReservaCaraLargoAlAzar2') });
	await raw('chatsPorSolicitud/lead-res-noche2', { token: sv('ChatDeLaReservaRN2LargoYAlAzar') });
	await espera('dueña crea su reserva directo al confirmar, con los montos de siempre (la crea el servidor)', crearR('mixto1', 'reservas/lead-res-noche', delSocio()), false);
	await espera('dueña crea su reserva directo por lo cotizado (la crea el servidor)', crearR('mixto1', 'reservas/lead-res-cara', delSocio({ leadId: 'lead-res-cara', codigo: 'EQ-RC', chat: 'ChatDeLaReservaCaraLargoAlAzar2', alojamiento: 500, ganancia: 200 })), false);
	// Un precio por fechas viejo de 1, en los dos documentos y con el margen: es un precio suyo, se deja.
	{
		const mapa = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'number' ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x }) : sv(x)])) } });
		const lista = (xs) => ({ arrayValue: { values: xs.map(mapa) } });
		const viejo = (precio) => ({ desde: '2000-01-01', hasta: '2000-01-01', precio });
		const truco = await loteConRenglon('mixto1', [
			{ update: { name: `${R}/properties/mx-noche/privado/socio`, fields: { tarifas: lista([viejo(1)]) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: { mapValue: { fields: { tarifas: lista([viejo(1.2)]) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }]);
		await espera('dueña pone un precio por fechas viejo de 1 en los dos documentos (cuadra con el margen)', Promise.resolve(truco), true);
	}
	await espera('el administrador crea la reserva de la solicitud (camino del administrador)', crearR('admin1', 'reservas/lead-res-noche', delSocio()), true);
	await espera('dueña crea una segunda reserva para la misma solicitud', escribirR('mixto1', 'reservas/lead-res-noche', delSocio({ costoSocio: 100, alojamiento: 120, ganancia: 20 })), false);
	await espera('dueña marca pagada la comisión de su reserva', parche('mixto1', 'reservas/lead-res-noche', ['comision.pagada'], { comision: { mapValue: { fields: { pagada: { booleanValue: true } } } } }), false);
	await espera('dueña baja la comisión de su reserva', parche('mixto1', 'reservas/lead-res-noche', ['comision.monto'], { comision: { mapValue: { fields: { monto: { doubleValue: 1 } } } } }), false);
	await raw('reservas/r-venta2', { propertyId: sv('mx-venta'), propietarioId: sv('m1'), estado: sv('confirmada') });
	await espera('dueña cancela una reserva de su casa en venta', parche('mixto1', 'reservas/r-venta2', ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('x') }), false);
	await raw('leads/lead-venta', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-venta'), propietarioId: sv('m1'), agentId: sv('a7') });
	await espera('dueña responde una «solicitud» de su casa en venta', parche('mixto1', 'leads/lead-venta', ['solicitud'], { solicitud: { mapValue: { fields: { estado: sv('confirmada') } } } }), false);
	const CV = 'ChatDeUnaCasaEnVentaLargoYAlAzar1234';
	await raw(`chats/${CV}`, { propietarioId: sv('m1'), propertyId: sv('mx-venta'), codigo: sv('EQ-V') });
	await espera('dueña escribe en un chat de su casa en venta', crear('mixto1', `chats/${CV}/mensajes/v1`, m('socio', 'Hola')), false);
	await espera('dueña confirma un chat de su casa en venta', parche('mixto1', `chats/${CV}`, ['estado'], { estado: sv('confirmada') }), false);
	await espera('dueña lee los mensajes de un chat de su casa en venta', leer('mixto1', `chats/${CV}/mensajes`), false);
	// Controles: lo mismo en su casa por noche sí se puede (con los campos opcionales ausentes)
	// Cancelar: lo hace el servidor por el socio (revisa que el cliente no haya pagado ni llegado); el socio directo, no.
	// El administrador, con el lote del panel (admin/js/reservas.js cancelarReserva).
	{
		const gt = (d) => new Date(Date.now() - 6 * 3600_000 + d * 86400_000).toISOString().slice(0, 10);
		const preparar = async (id, { chatEstado = 'confirmada' } = {}) => {
			const C = `ChatCancelar${id.replace(/[^A-Za-z0-9]/g, '')}LargoYAlAzar123`;
			await raw(`chats/${C}`, { leadId: sv(id), codigo: sv(`EQ-${id}`), propietarioId: sv('m1'), propertyId: sv('mx-noche'), estado: sv(chatEstado) });
			await raw(`chatsPorSolicitud/${id}`, { token: sv(C) });
			await raw(`reservas/${id}`, { propertyId: sv('mx-noche'), propietarioId: sv('m1'), estado: sv('confirmada'), leadId: sv(id), codigo: sv(`EQ-${id}`), llegada: sv(gt(10)), salida: sv(gt(40)), chat: sv(C) });
			await raw(`leads/${id}`, { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1'),
				solicitud: { mapValue: { fields: { estado: sv('confirmada'), historial: { arrayValue: { values: [{ mapValue: { fields: { que: sv('Confirmó') } } }] } } } } } });
			return C;
		};
		const fila = (que) => ({ mapValue: { fields: { que: sv(que) } } });
		const lote = (quien, id, C) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [
			{ update: { name: `${R}/reservas/${id}`, fields: { estado: sv('cancelada'), motivo: sv('Cliente canceló') } }, updateMask: { fieldPaths: ['estado', 'motivo'] }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
			{ update: { name: `${R}/leads/${id}`, fields: { solicitud: { mapValue: { fields: { estado: sv('cancelada'), motivo: sv('Cliente canceló'), historial: { arrayValue: { values: [fila('Confirmó'), fila('Canceló')] } } } } } } }, updateMask: { fieldPaths: ['solicitud'] } },
			{ update: { name: `${R}/chats/${C}/mensajes/fin`, fields: { de: sv(quien === 'admin1' ? 'equipo' : 'socio'), texto: sv('La reserva se canceló.') } }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
			{ update: { name: `${R}/chats/${C}`, fields: { estado: sv('cancelada') } }, updateMask: { fieldPaths: ['estado'] } }] }) }).then((r) => r.status);
		await espera('socio cancela directo con el lote de antes, sin que el cliente haya pagado (lo hace el servidor)', lote('mixto1', 'rc-ok', await preparar('rc-ok')), false);
		await espera('socio cancela directo solo la reserva', parche('mixto1', 'reservas/rc-ok', ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('Cliente canceló') }), false);
		await espera('el administrador cancela con el lote del panel (camino del administrador)', lote('admin1', 'rc-ok', 'ChatCancelarrcokLargoYAlAzar123'), true);
		await preparar('rc-pagada', { chatEstado: 'pagada' });
		await espera('el administrador cancela una reserva pagada (control)', parche('admin1', 'reservas/rc-pagada', ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('Acordado con el cliente') }), true);
	}
	await raw('leads/lead-noche', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1') });
	await raw('reservas/lead-noche', { propertyId: sv('mx-noche'), propietarioId: sv('m1'), estado: sv('confirmada'), leadId: sv('lead-noche') });
	await espera('dueña responde directo una solicitud de su casa por noche (lo hace el servidor)', parche('mixto1', 'leads/lead-noche', ['solicitud'], { solicitud: { mapValue: { fields: { estado: sv('confirmada'), historial: { arrayValue: { values: [{ mapValue: { fields: { que: sv('Confirmó') } } }] } } } } } }), false);
	const CN = 'ChatDeUnaCasaPorNocheLargoYAlAzar123';
	await raw(`chats/${CN}`, { propietarioId: sv('m1'), propertyId: sv('mx-noche'), codigo: sv('EQ-N'), leadId: sv('lead-noche') });
	await espera('dueña escribe en el chat de su casa por noche (control)', crear('mixto1', `chats/${CN}/mensajes/n1`, m('socio', 'Hola, bienvenidos')), true);
	await espera('dueña lee el chat de su casa por noche (control)', leer('mixto1', `chats/${CN}/mensajes`), true);
	await espera('dueña confirma directo el chat de su casa por noche (lo hace el servidor)', parche('mixto1', `chats/${CN}`, ['estado'], { estado: sv('confirmada') }), false);
	await raw('reservas/r-sin-casa', { propietarioId: sv('m1'), estado: sv('confirmada') });
	await espera('reserva vieja sin propertyId: se niega limpio (sin error)', parche('mixto1', 'reservas/r-sin-casa', ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('x') }), false);
	// Reserva hecha a mano en Rentas (admin/js/reservas.js): lleva el propietarioId de su casa (la ve su dueño) y el
	// teléfono y las notas del huésped van aparte, en properties/{casa}/privado/reserva-{id}, que el dueño no lee.
	await espera('el equipo crea una reserva a mano con el dueño de la casa', crear('admin1', 'reservas/r-mano', { propertyId: 'mx-noche', propietarioId: 'm1', estado: 'confirmada', canal: 'airbnb', huesped: 'Pedro', costoSocio: 300, alojamiento: 360, ganancia: 60, moneda: 'USD', agentId: '' }), true);
	await espera('el equipo guarda el contacto del huésped en lo privado de la casa', crear('admin1', 'properties/mx-noche/privado/reserva-r-mano', { telefono: '+502 5555 1234', notas: 'Llega tarde' }), true);
	await espera('la dueña ve la reserva hecha a mano de su casa', leer('mixto1', 'reservas/r-mano'), true);
	await espera('la dueña lista las reservas de su casa (por casa y por dueño)', fetch(`${H}:runQuery`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'reservas' }], where: { compositeFilter: { op: 'AND', filters: [
		{ fieldFilter: { field: { fieldPath: 'propertyId' }, op: 'EQUAL', value: sv('mx-noche') } }, { fieldFilter: { field: { fieldPath: 'propietarioId' }, op: 'EQUAL', value: sv('m1') } }] } } } }) }).then((r) => r.status), true);
	await espera('la dueña no lee el contacto del huésped', leer('mixto1', 'properties/mx-noche/privado/reserva-r-mano'), false);
	await espera('la dueña no lista lo privado de su casa', leer('mixto1', 'properties/mx-noche/privado'), false);
	await espera('otro dueño no ve esa reserva', leer('socio2', 'reservas/r-mano'), false);
	// Un asesor sin asesor vinculado (agentId vacío) no coincide con lo que no lleva asesor (casas por noche, sus reservas y solicitudes).
	await poner('users/asesor-sin', { rol: 'asesor', activo: true, agentId: '', nombre: 'Asesor sin vincular' });
	await espera('asesor sin vincular lee una reserva sin asesor', leer('asesor-sin', 'reservas/r-mano'), false);
	await espera('asesor sin vincular lee una solicitud sin asesor', leer('asesor-sin', 'leads/lead1'), false);
	await espera('asesor sin vincular lee el precio del dueño de una casa sin asesor', leer('asesor-sin', 'properties/mx-noche/privado/socio'), false);
	// El caso más pesado para las reglas: 10 precios por fechas que tocan la estancia (el más barato, 90: piso 270).
	{
		const mapa = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'number' ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x }) : sv(x)])) } });
		const lista = (xs) => ({ arrayValue: { values: xs.map(mapa) } });
		const diez = Array.from({ length: 10 }, (_, k) => ({ desde: '2026-11-25', hasta: `2026-12-0${k < 9 ? k + 1 : 9}`, precio: 90 + k }));
		const puso = await loteConRenglon('mixto1', [
			{ update: { name: `${R}/properties/mx-noche/privado/socio`, fields: { tarifas: lista(diez) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: { mapValue: { fields: { tarifas: lista(diez.map((x) => ({ ...x, precio: Math.round(x.precio * 120) / 100 }))) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }]);
		await espera('dueña pone 10 precios por fechas que tocan diciembre (control)', Promise.resolve(puso), true);
		await raw('leads/lead-res-noche2', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1'), reserva: { mapValue: { fields: { codigo: sv('EQ-RN2'), llegada: sv('2026-12-01'), salida: sv('2026-12-04'), noches: { integerValue: '3' } } } } });
		// El lote de «Confirmada» que el socio mandaba antes (reserva, fechas de la casa, solicitud, chat y datos de pago):
		// ya no pasa, ni con los montos que cuadran con sus 10 precios por fechas.
		{
			const C3 = 'ChatDeLaReservaRN3LargoYAlAzar';
			await raw('leads/lead-res-noche3', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1'), reserva: { mapValue: { fields: { codigo: sv('EQ-RN3'), llegada: sv('2026-12-01'), salida: sv('2026-12-04'), noches: { integerValue: '3' } } } } });
			await raw(`chats/${C3}`, { leadId: sv('lead-res-noche3'), codigo: sv('EQ-RN3'), propietarioId: sv('m1'), propertyId: sv('mx-noche') });
			await raw('chatsPorSolicitud/lead-res-noche3', { token: sv(C3) });
			const res = delSocio({ leadId: 'lead-res-noche3', codigo: 'EQ-RN3', chat: C3, costoSocio: 270, alojamiento: 324, ganancia: 54 }, { monto: 54 });
			const ts = (campo) => ({ fieldPath: campo, setToServerValue: 'REQUEST_TIME' });
			const lote = await fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes: [
				{ update: { name: `${R}/reservas/lead-res-noche3`, fields: Object.fromEntries(Object.entries(res).map(([k, x]) => [k, vv(x)])) }, currentDocument: { exists: false }, updateTransforms: [ts('createdAt'), ts('updatedAt')] },
				{ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: { mapValue: { fields: { reservadas: { arrayValue: { values: [mapa({ desde: '2026-12-01', hasta: '2026-12-03' })] } } } } } } }, updateMask: { fieldPaths: ['vacacional.reservadas'] }, updateTransforms: [ts('updatedAt')] },
				{ update: { name: `${R}/leads/lead-res-noche3`, fields: { solicitud: { mapValue: { fields: { estado: sv('confirmada'), reservaId: sv('lead-res-noche3'), costoSocio: { integerValue: '270' }, comision: { integerValue: '54' },
					historial: { arrayValue: { values: [mapa({ que: 'Confirmó', quien: 'mixto1', nombre: 'Dueña', cuando: new Date().toISOString() })] } } } } } } },
					updateMask: { fieldPaths: ['solicitud.estado', 'solicitud.reservaId', 'solicitud.costoSocio', 'solicitud.comision', 'solicitud.historial'] }, updateTransforms: [ts('updatedAt')] },
				{ update: { name: `${R}/chats/${C3}`, fields: { estado: sv('confirmada') } }, updateMask: { fieldPaths: ['estado'] }, currentDocument: { exists: true } },
				{ update: { name: `${R}/chats/${C3}/mensajes/pago`, fields: { de: sv('socio'), tipo: sv('pago'), texto: sv('Banco 1') } }, currentDocument: { exists: false }, updateTransforms: [ts('createdAt')] }] }) }).then((r) => r.status);
			await espera('el lote de «Confirmada» del socio, directo (lo hace el servidor)', Promise.resolve(lote), false);
		}
	}
	// Más de 10 precios por fechas (de antes): la dueña solo puede quitar, no cambiar ni agregar.
	{
		const mapa = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'number' ? { integerValue: String(x) } : sv(x)])) } });
		const lista = (xs) => ({ arrayValue: { values: xs.map(mapa) } });
		const doce = Array.from({ length: 12 }, (_, k) => ({ desde: `2028-${String(k + 1).padStart(2, '0')}-01`, hasta: `2028-${String(k + 1).padStart(2, '0')}-05`, precio: 100 }));
		const pub = (xs) => xs.map((x) => ({ ...x, precio: 120 }));
		await raw('properties/mx-noche-12', { titulo: sv('Casa con 12 precios por fechas'), operacion: sv('vacacional'), propietarioId: sv('m1'), publicado: { booleanValue: false }, vacacional: { mapValue: { fields: { base: { integerValue: '120' }, tarifas: lista(pub(doce)) } } } });
		await raw('properties/mx-noche-12/privado/socio', { precioBase: { integerValue: '100' }, tarifas: lista(doce) });
		const escribir = (soc, publico) => loteConRenglon('mixto1', [
			{ update: { name: `${R}/properties/mx-noche-12/privado/socio`, fields: { tarifas: lista(soc) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche-12`, fields: { vacacional: { mapValue: { fields: { tarifas: lista(publico) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }]);
		const otro = [...doce.slice(1, 11), { ...doce[0], precio: 1 }];
		await espera('dueña con 12 precios por fechas cambia uno (11 que no estaban así)', escribir(otro, pub(otro)), false);
		await espera('dueña con 12 precios por fechas quita uno (control)', escribir(doce.slice(1), pub(doce.slice(1))), true);
	}
	// Un formulario lleva el asesor de su casa: una página vieja no le manda la solicitud de una casa por noche al asesor.
	{
		const lead = (agentId) => ({ nombre: 'Ana', telefono: '+502 5555 1234', email: '', mensaje: '', origen: 'reserva', pagina: '/x/', propertyId: 'mx-noche', propertyTitulo: 'Casa', agentId, estado: 'nuevo' });
		await espera('formulario de una casa por noche con el asesor de una página vieja', crear(null, 'leads/lead-pagina-vieja', lead('a7')), false);
		await espera('formulario de una casa por noche sin asesor (control)', crear(null, 'leads/lead-pagina-nueva', lead('')), true);
		// Una solicitud de reserva (con «reserva») no nace desde el navegador: la crea el servidor con su chat y su índice
		// (netlify/functions/solicitud.mjs; lo que se revisaba aquí —cotización, fechas, moneda, personas— se prueba en
		// scripts/test-solicitud.mjs).
		const conReserva = (id, r) => fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes: [{ update: { name: `${R}/leads/${id}`,
			fields: { ...campos(lead('')), reserva: { mapValue: { fields: Object.fromEntries(Object.entries(r).map(([k, x]) => [k, typeof x === 'number' ? { doubleValue: x } : sv(x)])) } } } },
			currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((x) => x.status);
		const bien = { codigo: 'EQ-COT', llegada: '2030-03-01', salida: '2030-03-04', noches: 3, huespedes: 2, subtotal: 400, impuestos: 88, total: 488, deposito: 0, moneda: 'USD' };
		await espera('anónimo crea una solicitud de reserva bien cotizada directo en la base (la crea el servidor)', conReserva('lead-cot-ok', bien), false);
		await espera('anónimo crea un lead con el socio de la casa (solo con reserva, por el servidor)', crear(null, 'leads/lead-socio', { ...lead(''), propietarioId: 'm1' }), false);
		// La fecha de visita: AAAA-MM-DD, de hoy a un año (hoy en Guatemala con la hora del servidor).
		const dia = (n) => new Date(Date.now() - 6 * 3600000 + n * 86400000).toISOString().slice(0, 10);
		await espera('formulario con la fecha de visita de anteayer', crear(null, 'leads/lead-visita-1', { ...lead(''), fechaVisita: dia(-2) }), false);
		await espera('formulario con la fecha de visita de «ayer» (teléfono con el reloj corrido: un día de holgura, control)', crear(null, 'leads/lead-visita-0', { ...lead(''), fechaVisita: dia(-1) }), true);
		await espera('formulario con la fecha de visita en dos años', crear(null, 'leads/lead-visita-2', { ...lead(''), fechaVisita: dia(730) }), false);
		await espera('formulario con la fecha de visita como texto', crear(null, 'leads/lead-visita-3', { ...lead(''), fechaVisita: 'el lunes' }), false);
		await espera('formulario con la fecha de visita de hoy (control)', crear(null, 'leads/lead-visita-4', { ...lead(''), fechaVisita: dia(0) }), true);
		await espera('formulario con la fecha de visita en 365 días (control)', crear(null, 'leads/lead-visita-5', { ...lead(''), fechaVisita: dia(365) }), true);
	}
	// La casa cambió de asesor y la página no se ha vuelto a publicar: el sitio reintenta sin asesor y la recibe el
	// administrador (js/site.js); con el asesor de antes, no (no le llega el contacto a quien ya no la lleva).
	{
		await raw('properties/casa-con-asesor', { titulo: sv('Casa en venta'), operacion: sv('venta'), agentId: sv('a7'), publicado: { booleanValue: true } });
		const formulario = (agentId) => ({ nombre: 'Luis', telefono: '+502 5555 1234', email: '', mensaje: 'Me interesa', origen: 'propiedad', pagina: '/x/', propertyId: 'casa-con-asesor', propertyTitulo: 'Casa en venta', agentId, estado: 'nuevo' });
		await espera('formulario con el asesor anterior de la casa (página sin volver a publicar)', crear(null, 'leads/lead-asesor-viejo', formulario('a9')), false);
		await espera('el reintento sin asesor: la solicitud le llega al administrador (control)', crear(null, 'leads/lead-asesor-vacio', formulario('')), true);
		await espera('formulario con el asesor de la casa (control)', crear(null, 'leads/lead-asesor-bien', formulario('a7')), true);
		await espera('el asesor anterior no lee la solicitud que fue al administrador', leer('asesor9', 'leads/lead-asesor-vacio'), false);
	}
	// Chats: del equipo solo el administrador (las casas por noche no llevan asesor).
	await espera('un asesor lista los chats', consulta('asesor9', 'chats'), false);
	await espera('un asesor lee los mensajes de un chat', leer('asesor9', `chats/${T}/mensajes`), false);
	await espera('el administrador lista los chats (control)', consulta('admin1', 'chats'), true);
	await espera('el equipo pasa una reserva por venir al dueño nuevo de la casa', parche('admin1', 'reservas/r-mano', ['propietarioId'], { propietarioId: sv('o2') }), true);
	await espera('el dueño nuevo la ve', leer('socio2', 'reservas/r-mano'), true);
	await espera('el dueño anterior ya no', leer('mixto1', 'reservas/r-mano'), false);
	await parche('admin1', 'reservas/r-mano', ['propietarioId'], { propietarioId: sv('m1') });
	await espera('la dueña crea una reserva a nombre de otro dueño', crear('mixto1', 'reservas/r-otro', { propertyId: 'mx-noche', propietarioId: 'o2', estado: 'confirmada' }), false);
	await espera('la dueña crea una reserva pendiente (solo confirma)', crear('mixto1', 'reservas/r-pend', { propertyId: 'mx-noche', propietarioId: 'm1', estado: 'pendiente' }), false);
	await espera('la dueña cambia los montos de su reserva', parche('mixto1', 'reservas/r-mano', ['costoSocio'], { costoSocio: { doubleValue: 999 } }), false);
	await espera('la dueña cancela una reserva hecha a mano (sin chat: la cancela el administrador)', parche('mixto1', 'reservas/r-mano', ['estado', 'motivo', 'updatedAt'], { estado: sv('cancelada'), motivo: sv('Cliente canceló'), updatedAt: { timestampValue: new Date().toISOString() } }), false);
	// Del equipo, solo el administrador escribe reservas (Rentas y Solicitudes son suyas).
	await espera('un asesor crea una reserva para un dueño', crear('asesor7', 'reservas/r-asesor', { propertyId: 'mx-noche', propietarioId: 'm1', estado: 'confirmada', agentId: 'a7' }), false);
	await raw('reservas/r-del-asesor', { propertyId: sv('mx-venta'), propietarioId: sv('m1'), agentId: sv('a7'), estado: sv('confirmada') });
	await espera('un asesor cambia una reserva con su agentId', parche('asesor7', 'reservas/r-del-asesor', ['costoSocio'], { costoSocio: { doubleValue: 1 } }), false);
	await espera('un asesor borra una reserva con su agentId', fetch(`${H}/reservas/r-del-asesor`, { method: 'DELETE', headers: cab('asesor7') }).then((r) => r.status), false);
	// Comprobante de la comisión: lo pone quien ganó la reserva aunque la casa ya no sea suya, y es una foto de su carpeta.
	{
		const url = (id) => `https://firebasestorage.googleapis.com/v0/b/eqinmobiliariobd.firebasestorage.app/o/comprobantes%2F${id}%2F1731600000000-pago.jpg?alt=media&token=1a2b-3c4d`;
		const comprobante = (quien, id, texto) => parche(quien, `reservas/${id}`, ['comision.comprobante'], { comision: { mapValue: { fields: { comprobante: sv(texto) } } } });
		await raw('reservas/r-recibo', { propertyId: sv('prueba-casa-playa-monterrico'), propietarioId: sv('m1'), estado: sv('confirmada'), comision: { mapValue: { fields: { monto: { doubleValue: 10 }, pagada: { booleanValue: false } } } } });
		await espera('el dueño anterior pone el comprobante de su reserva pasada (la casa ya es de otro)', comprobante('mixto1', 'r-recibo', url('r-recibo')), true);
		await espera('comprobante con un texto cualquiera', comprobante('mixto1', 'r-recibo', 'Te pagué, llámame al 5555 0001'), false);
		await espera('comprobante de la carpeta de otra reserva', comprobante('mixto1', 'r-recibo', url('lead-res-noche')), false);
		await espera('comprobante alojado en el almacenamiento de otro proyecto (podría llevar a una página falsa)', comprobante('mixto1', 'r-recibo', url('r-recibo').replace('eqinmobiliariobd.firebasestorage.app', 'atacante.firebasestorage.app')), false);
		await espera('otro dueño pone el comprobante', comprobante('socio2', 'r-recibo', url('r-recibo')), false);
		const CA = 'ChatDeUnaCasaQueYaNoEsSuyaLargo12';
		await raw(`chats/${CA}`, { propietarioId: sv('m1'), propertyId: sv('prueba-casa-playa-monterrico'), codigo: sv('EQ-ANT'), estado: sv('confirmada') });
		await espera('el dueño anterior lee los mensajes del chat de una casa que ya no es suya', leer('mixto1', `chats/${CA}/mensajes`), false);
		await espera('el dueño anterior lista sus chats (también el de esa casa)', consulta('mixto1', 'chats', 'propietarioId', 'm1'), true);
	}
	await espera('la dueña quita de su casa las fechas reservadas (las escriben el administrador y el servidor)', parche('mixto1', 'properties/mx-noche', ['vacacional.reservadas', 'updatedAt'], { vacacional: { mapValue: { fields: { reservadas: { arrayValue: { values: [] } } } } }, updatedAt: { timestampValue: new Date().toISOString() } }), false);
	// El equipo: el asesor no crea ni cambia usuarios
	await espera('asesor crea un usuario', crear('asesor9', 'users/nuevo1', { rol: 'socio', activo: true, propietarioId: 'm1' }), false);
	await espera('asesor desactiva a un dueño', parche('asesor9', 'users/mixto1', ['activo'], { activo: { booleanValue: false } }), false);
	// Una casa por noche no lleva asesor: el asesor no crea una ni pasa la suya a por noche.
	await espera('un asesor se devuelve los permisos del socio en la ficha del dueño', parche('asesor7', 'propietarios/m1', ['permisos'], { permisos: { mapValue: { fields: { devolver: { booleanValue: true } } } } }), false);
	await espera('un asesor lee los permisos de un socio', leer('asesor7', 'permisosSocios/m1'), false);
	// Datos de pago del socio (los recibe el cliente al confirmar): solo el administrador, con su renglón de cambio.
	{
		const R = 'projects/demo-eq/databases/(default)/documents';
		const lote = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
		// Con la bitácora de cambios sensibles: la ficha nombra su renglón (bitacoraId) y el renglón lleva la foto de
		// antes y de después (datos de pago y permisos) tal como están en la base.
		const ficha = (pago, log) => ({ update: { name: `${R}/propietarios/m1`, fields: { datosPago: sv(pago), ...(log ? { bitacoraId: sv(log) } : {}) } }, updateMask: { fieldPaths: ['datosPago', ...(log ? ['bitacoraId'] : [])] } });
		const foto = (pago) => ({ mapValue: { fields: { datosPago: sv(pago), permisos: { mapValue: {} } } } });
		const renglon = (id, quien, o = {}) => ({ update: { name: `${R}/bitacora/${id}`, fields: { tipo: sv('propietario'), objeto: sv('m1'), antes: foto('Banco 1'), despues: foto('Banco 2'), quien: sv(quien), nombre: sv('Admin'), avisado: { booleanValue: false }, ...o } },
			currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] });
		await espera('el asesor de la dueña le cambia sus datos de pago', parche('asesor7', 'propietarios/m1', ['datosPago'], { datosPago: sv('Banco del asesor 999') }), false);
		await espera('el asesor cambia los datos de pago con su renglón', lote('asesor7', [ficha('Banco 2', 'pg1'), renglon('pg1', 'asesor7')]), false);
		await espera('el administrador cambia los datos de pago sin su renglón', parche('admin1', 'propietarios/m1', ['datosPago'], { datosPago: sv('Banco 2') }), false);
		await espera('el administrador anota otro «antes» del que había', lote('admin1', [ficha('Banco 2', 'pg2'), renglon('pg2', 'admin1', { antes: foto('Banco 0') })]), false);
		await espera('el administrador anota otro «después» del que guarda', lote('admin1', [ficha('Banco 2', 'pg3'), renglon('pg3', 'admin1', { despues: foto('Banco 3') })]), false);
		await espera('el administrador firma el renglón como otra persona', lote('admin1', [ficha('Banco 2', 'pg4'), renglon('pg4', 'asesor7')]), false);
		await espera('el administrador cambia los datos de pago sin «avisado» (sin correo al equipo)', lote('admin1', [ficha('Banco 2', 'pg6'), renglon('pg6', 'admin1', { avisado: { booleanValue: true } })]), false);
		await espera('el administrador cambia los datos de pago con su renglón (control)', lote('admin1', [ficha('Banco 2', 'pg5'), renglon('pg5', 'admin1')]), true);
		await espera('nadie cambia un renglón de la bitácora', parche('admin1', 'bitacora/pg5', ['nombre'], { nombre: sv('Otro') }), false);
		await espera('nadie borra un renglón de la bitácora', fetch(`${H}/bitacora/pg5`, { method: 'DELETE', headers: cab('admin1') }).then((r) => r.status), false);
		await espera('el asesor lee la bitácora de cambios sensibles', leer('asesor7', 'bitacora/pg5'), false);
		await espera('la dueña lee la bitácora de cambios sensibles', leer('mixto1', 'bitacora/pg5'), false);
		await espera('el asesor busca en la bitácora por dueño', consulta('asesor7', 'bitacora', 'objeto', 'm1'), false);
		await espera('el administrador lee la bitácora de cambios sensibles (control)', leer('admin1', 'bitacora/pg5'), true);
		await espera('el administrador busca en la bitácora por dueño (control)', consulta('admin1', 'bitacora', 'objeto', 'm1'), true);
		await espera('ya nadie crea renglones en cambiosDatosPago', lote('admin1', [{ update: { name: `${R}/cambiosDatosPago/viejo1`, fields: { propietarioId: sv('m1') } }, currentDocument: { exists: false } }]), false);
		await espera('el asesor guarda otra cosa de la ficha (control)', parche('asesor7', 'propietarios/m1', ['notas'], { notas: sv('Nota nueva') }), true);
		await espera('el asesor pone otros datos de pago en el resumen de la dueña', parche('asesor7', `portalPropietarios/${TM}`, ['datosPago'], { datosPago: sv('Banco del asesor 999') }), false);
	}
	await espera('el administrador devuelve los permisos sin su renglón en la bitácora', parche('admin1', 'propietarios/m1', ['permisos'], { permisos: { mapValue: { fields: { devolver: { booleanValue: false } } } } }), false);
	{
		const foto = (dev) => ({ mapValue: { fields: { datosPago: sv('Banco 2'), permisos: dev === null ? { mapValue: {} } : { mapValue: { fields: { devolver: { booleanValue: dev } } } } } } });
		await espera('el administrador devuelve los permisos en la ficha del dueño, con su renglón (control)', fetch(`${H}:commit`, { method: 'POST', headers: cab('admin1'), body: JSON.stringify({ writes: [
			{ update: { name: `${RAIZ}/propietarios/m1`, fields: { permisos: { mapValue: { fields: { devolver: { booleanValue: false } } } }, bitacoraId: sv('perm1') } }, updateMask: { fieldPaths: ['permisos', 'bitacoraId'] } },
			{ update: { name: `${RAIZ}/bitacora/perm1`, fields: { tipo: sv('propietario'), objeto: sv('m1'), antes: foto(null), despues: foto(false), quien: sv('admin1'), nombre: sv('Admin') } }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status), true);
	}
	await espera('un asesor crea una casa por noche a su nombre', crear('asesor7', 'properties/noche-del-asesor', { titulo: 'x', operacion: 'vacacional', agentId: 'a7', publicado: false }), false);
	await espera('un asesor pasa su casa en venta a por noche', parche('asesor7', 'properties/prueba-casa-en-venta', ['operacion'], { operacion: sv('vacacional') }), false);
	await espera('un asesor cambia el título de su casa en venta (control)', parche('asesor7', 'properties/prueba-casa-en-venta', ['titulo'], { titulo: sv('Casa en venta (prueba)') }), true);
	// Bitácora: el administrador, el asesor de la casa y el dueño de una casa por noche.
	{
		const entrada = (quien, casa, id) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/properties/${casa}/bitacora/${id}`, fields: { que: sv('cambio'), quien: sv(quien) } }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
		await espera('el asesor de la casa escribe en su bitácora (control)', entrada('asesor7', 'prueba-casa-en-venta', 'b1'), true);
		await espera('el asesor de la casa lee su bitácora (control)', leer('asesor7', 'properties/prueba-casa-en-venta/bitacora'), true);
		await espera('un asesor lee la bitácora de la casa de otro asesor', leer('asesor9', 'properties/prueba-casa-en-venta/bitacora'), false);
		await espera('un asesor escribe en la bitácora de la casa de otro asesor', entrada('asesor9', 'prueba-casa-en-venta', 'b2'), false);
		await espera('la dueña escribe en la bitácora de su casa por noche (control)', entrada('mixto1', 'mx-noche', 'b3'), true);
	}
	// Resumen del dueño: el asesor lo arma solo para las personas que atiende.
	{
		const resumen = (quien, token, propietarioId, agentId, pago = 'Banco 2') => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/portalPropietarios/${token}`,
			fields: { email: sv('x@example.com'), agentId: sv(agentId), propietarioId: sv(propietarioId), datosPago: sv(pago), propiedades: { arrayValue: { values: [] } } } }, currentDocument: { exists: false } }] }) }).then((r) => r.status);
		await espera('un asesor arma el resumen de una persona de otro asesor', resumen('asesor7', 'ResumenAjenoDeOtroAsesorLargoYAlAzar12', 'o2', 'a7'), false);
		await espera('un asesor arma el resumen de una persona suya con otros datos de pago que los de su ficha', resumen('asesor7', 'ResumenPagoAjenoDelAsesorLargoYAlAzar12', 'm1', 'a7', 'Banco del asesor 999'), false);
		await espera('un asesor arma el resumen de una persona suya, con los datos de pago de su ficha (control)', resumen('asesor7', 'ResumenPropioDelAsesorLargoYAlAzar1234', 'm1', 'a7'), true);
	}
	// Casa por noche sin privado/socio todavía: el dueño lo crea con sus precios, junto con el público y con el margen.
	{
		const juntos = (writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes }) }).then((r) => r.status);
		const suyo = (f) => ({ update: { name: `${R}/properties/mx-noche-sin-precio/privado/socio`, fields: f }, currentDocument: { exists: false } });
		const publico = (n) => ({ update: { name: `${R}/properties/mx-noche-sin-precio`, fields: { vacacional: { mapValue: { fields: { base: { integerValue: String(n) } } } } } }, updateMask: { fieldPaths: ['vacacional.base'] } });
		await espera('dueña crea su precio sin el margen en el público', juntos([suyo({ precioBase: { integerValue: '100' } }), publico(100)]), false);
		await espera('dueña crea su precio poniéndose el margen', juntos([suyo({ precioBase: { integerValue: '100' }, margen: { integerValue: '0' } }), publico(100)]), false);
		const renglon = { update: { name: `${R}/bitacora/crea1`, fields: { tipo: sv('casa'), objeto: sv('mx-noche-sin-precio'), casa: sv('mx-noche-sin-precio'), quien: sv('mixto1'), nombre: sv('Dueña'),
			antes: { mapValue: { fields: { moneda: sv(''), propietarioId: sv('m1'), limpieza: { integerValue: '0' }, precioBase: { integerValue: '0' }, precioFinde: { integerValue: '0' }, tarifas: { arrayValue: {} }, margen: { integerValue: '20' } } } },
			despues: { mapValue: { fields: { moneda: sv(''), propietarioId: sv('m1'), limpieza: { integerValue: '0' }, precioBase: { integerValue: '100' }, precioFinde: { integerValue: '0' }, tarifas: { arrayValue: {} }, margen: { integerValue: '20' } } } } } },
			currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] };
		await espera('dueña crea su precio con el público y el margen, sin su renglón en la bitácora', juntos([suyo({ precioBase: { integerValue: '100' } }), publico(120)]), false);
		await espera('dueña crea su precio con el público, el margen y su renglón (control)', juntos([suyo({ precioBase: { integerValue: '100' }, bitacoraId: sv('crea1') }), publico(120), renglon]), true);
	}
}
// Storage (storage.rules): fotos del sitio, comprobantes del cliente (chats/{token}) y de la comisión (comprobantes/{reserva}).
// Un dueño con acceso al panel no es del equipo: no lista el bucket (las carpetas de los chats son las llaves de las
// reservas) ni cambia o borra las fotos del sitio.
{
	const B = 'http://127.0.0.1:9199/v0/b/eqinmobiliariobd.firebasestorage.app/o';
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
	const auth = (quien) => (quien === 'dueño' ? { Authorization: 'Bearer owner' } : quien ? { Authorization: `Bearer ${jwt(quien)}` } : {});
	const subir = (quien, ruta, tipo = 'image/png') => fetch(`${B}?uploadType=media&name=${encodeURIComponent(ruta)}`, { method: 'POST', headers: { 'Content-Type': tipo, ...auth(quien) }, body: png }).then((r) => r.status);
	const listar = (quien, prefijo) => fetch(`${B}?prefix=${encodeURIComponent(prefijo)}`, { headers: auth(quien) }).then((r) => r.status);
	const borrar = (quien, ruta) => fetch(`${B}/${encodeURIComponent(ruta)}`, { method: 'DELETE', headers: auth(quien) }).then((r) => r.status);
	const bajar = (ruta) => fetch(`${B}/${encodeURIComponent(ruta)}?alt=media`).then((r) => r.status);
	await poner('users/asesor9', { rol: 'asesor', activo: true, agentId: 'a9', nombre: 'Asesor' });
	await espera('storage: el administrador sube una foto de una casa', subir('admin1', 'properties/casa1/foto1.png'), true);
	await espera('storage: un asesor sube una foto de una casa que todavía no existe (ficha nueva)', subir('asesor9', 'properties/casa1/foto2.png'), true);
	await espera('storage: el asesor de la casa sube una foto (control)', subir('asesor7', 'properties/prueba-casa-en-venta/f1.png'), true);
	await espera('storage: un asesor reemplaza la foto de la casa de otro asesor', subir('asesor9', 'properties/prueba-casa-en-venta/f1.png'), false);
	await espera('storage: un asesor borra la foto de la casa de otro asesor', borrar('asesor9', 'properties/prueba-casa-en-venta/f1.png'), false);
	await espera('storage: un asesor sin asesor vinculado cambia la foto de una casa por noche', subir('asesor-sin', 'properties/mx-noche/f1.png'), false);
	await espera('storage: el administrador cambia la foto de cualquier casa (control)', subir('admin1', 'properties/prueba-casa-en-venta/f1.png'), true);
	await espera('storage: un asesor sube una foto del contenido del sitio (control)', subir('asesor9', 'agents/a9/foto.png'), true);
	await espera('storage: cualquiera abre una foto por su dirección', bajar('properties/casa1/foto1.png'), true);
	await espera('storage: el dueño lista las fotos del sitio', listar('mixto1', 'properties/'), false);
	await espera('storage: el dueño lista las carpetas de los chats', listar('mixto1', 'chats/'), false);
	await espera('storage: un anónimo lista el bucket', listar(null, ''), false);
	await espera('storage: el administrador lista las fotos (control)', listar('admin1', 'properties/'), true);
	await espera('storage: un asesor lista las carpetas de los chats', listar('asesor9', 'chats/'), false);
	await espera('storage: el dueño reemplaza una foto del sitio', subir('mixto1', 'properties/casa1/foto1.png'), false);
	await espera('storage: el dueño sube una foto al sitio', subir('mixto1', 'site/portada.png'), false);
	await espera('storage: el dueño borra una foto del sitio', borrar('mixto1', 'properties/casa1/foto1.png'), false);
	await espera('storage: el dueño sube una foto nueva de su casa por noche', subir('socio1', 'properties/prueba-casa-playa-monterrico/nueva1.png'), true);
	await espera('storage: el dueño reemplaza esa foto', subir('socio1', 'properties/prueba-casa-playa-monterrico/nueva1.png'), false);
	await espera('storage: el dueño borra una foto de su casa', borrar('socio1', 'properties/prueba-casa-playa-monterrico/nueva1.png'), false);
	await espera('storage: otro dueño sube una foto a esa casa', subir('socio2', 'properties/prueba-casa-playa-monterrico/nueva2.png'), false);
	await espera('storage: el dueño sube una foto a una casa en venta', subir('socio1', 'properties/prueba-casa-en-venta/nueva3.png'), false);
	await espera('storage: el dueño sube algo que no es foto a su casa', subir('socio1', 'properties/prueba-casa-playa-monterrico/nota.txt', 'text/plain'), false);
	await espera('storage: el dueño sube a una subcarpeta de su casa', subir('socio1', 'properties/prueba-casa-playa-monterrico/x/y.png'), false);
	await espera('storage: un acceso quitado sube una foto',subir('apagado1', 'properties/casa1/foto3.png'), false);
	await espera('storage: el equipo sube algo que no es foto', subir('admin1', 'properties/casa1/nota.txt', 'text/plain'), false);
	await espera('storage: la dueña sube un SVG como comprobante', subir('mixto1', 'comprobantes/lead-res-noche/pago.svg', 'image/svg+xml'), false);
	await espera('storage: el cliente sube el comprobante de su reserva', subir(null, `chats/${T}/comprobante1.png`), true);
	await espera('storage: el cliente reemplaza su comprobante', subir(null, `chats/${T}/comprobante1.png`), false);
	await espera('storage: el cliente sube a un chat que no existe', subir(null, 'chats/NoExisteEsteChatLargoYAlAzar12/x.png'), false);
	await espera('storage: nadie borra el comprobante del cliente (ni el equipo)', borrar('admin1', `chats/${T}/comprobante1.png`), false);
	await espera('storage: la dueña sube el comprobante de la comisión de su reserva', subir('mixto1', 'comprobantes/lead-res-noche/pago1.png'), true);
	await espera('storage: la dueña reemplaza ese comprobante', subir('mixto1', 'comprobantes/lead-res-noche/pago1.png'), false);
	await espera('storage: otro dueño sube un comprobante a esa reserva', subir('socio2', 'comprobantes/lead-res-noche/pago2.png'), false);
	await espera('storage: la dueña sube un comprobante a una reserva que no existe', subir('mixto1', 'comprobantes/no-existe/pago.png'), false);
	await espera('storage: el equipo reemplaza el comprobante de la comisión', subir('admin1', 'comprobantes/lead-res-noche/pago1.png'), false);
	await espera('storage: la dueña borra el comprobante de la comisión', borrar('mixto1', 'comprobantes/lead-res-noche/pago1.png'), false);
	await espera('storage: el dueño anterior sube el comprobante de su reserva pasada (como en la base)', subir('mixto1', 'comprobantes/r-recibo/pago1.png'), true);
}
// Nadie se hace administrador solo: el arranque «primer administrador» se cerró (aunque meta/bootstrap faltara, como
// aquí, una cuenta recién creada no puede escribir su users/ con rol admin ni la marca).
{
	const lote = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
	const docu = (ruta, o) => ({ update: { name: `${RAIZ}/${ruta}`, fields: campos(o) }, currentDocument: { exists: false } });
	await espera('cuenta nueva se crea como administrador junto con meta/bootstrap', lote('intruso1', [docu('users/intruso1', { rol: 'admin', activo: true, nombre: 'Intruso' }), docu('meta/bootstrap', { uid: 'intruso1' })]), false);
	await espera('cuenta nueva se crea su users/ como administrador', lote('intruso1', [docu('users/intruso1', { rol: 'admin', activo: true, nombre: 'Intruso' })]), false);
	await espera('cuenta nueva se crea su users/ como dueño', lote('intruso1', [docu('users/intruso1', { rol: 'socio', activo: true, propietarioId: 'o1', nombre: 'Intruso' })]), false);
	await espera('anónimo crea un users/', lote(null, [docu('users/anon1', { rol: 'admin', activo: true })]), false);
	await espera('ni el administrador escribe meta/bootstrap', lote('admin1', [docu('meta/bootstrap', { uid: 'admin1' })]), false);
	// Los límites de pedidos (limites/{huella}) los escribe solo el servidor: nadie del panel ni de afuera los lee ni los borra.
	await espera('el administrador lee un límite de pedidos', leer('admin1', 'limites/abc'), false);
	await espera('alguien de afuera borra su límite de pedidos', lote(null, [{ delete: `${RAIZ}/limites/abc` }]), false);
	await espera('el administrador escribe un límite de pedidos', lote('admin1', [docu('limites/abc', { veces: [1] })]), false);
	// Las solicitudes recientes de cada casa (apartadasCasa/{casa}, las que ponen en fila a las de a la vez): solo el servidor.
	await poner('apartadasCasa/casa1', { lista: [] });
	for (const [quien, nombre] of [[null, 'sin sesión'], ['socio1', 'el socio'], ['admin1', 'el administrador']]) {
		await espera(`${nombre} lee apartadasCasa`, leer(quien, 'apartadasCasa/casa1'), false);
		await espera(`${nombre} lista apartadasCasa`, consulta(quien, 'apartadasCasa'), false);
		await espera(`${nombre} crea apartadasCasa`, lote(quien, [docu('apartadasCasa/otra', { lista: [] })]), false);
		await espera(`${nombre} cambia apartadasCasa`, lote(quien, [{ update: { name: `${RAIZ}/apartadasCasa/casa1`, fields: campos({ lista: [] }) } }]), false);
	}
	// Las alertas de «No se dio» con fechas ocupadas (alertas/bloqueo-{id}) también: solo el servidor, para que nadie
	// las borre y el aviso salga otra vez, ni marque una como avisada para que no salga.
	await espera('el administrador lee una alerta de bloqueo', leer('admin1', 'alertas/bloqueo-x'), false);
	await espera('el socio marca una alerta como avisada', lote('socio1', [docu('alertas/bloqueo-x', { leadId: 'x' })]), false);
	await espera('alguien de afuera borra una alerta', lote(null, [{ delete: `${RAIZ}/alertas/bloqueo-x` }]), false);
	await espera('el administrador crea un usuario (control)', lote('admin1', [docu('users/nuevo1', { rol: 'asesor', activo: true, nombre: 'Nuevo', agentId: 'a1' })]), true);
}
// «Listo» de la campana de avisos (avisosAtendidos/{clave}): cada quien marca solo lo suyo, con la clave del registro.
{
	await poner('users/asesor7', { rol: 'asesor', activo: true, agentId: 'a7', nombre: 'Asesor de la casa en venta' });
	await poner('users/asesor9', { rol: 'asesor', activo: true, agentId: 'a9', nombre: 'Asesor' });
	await poner('comentariosPropietarios/comA7', { propietarioId: 'm1', agentId: 'a7', propiedadId: 'mx-venta', tipo: 'cambios', texto: 'Cambiar la foto', origen: 'propietario' });
	await poner('properties/casa-a7', { titulo: 'Casa del asesor 7', operacion: 'venta', agentId: 'a7', propietarioId: 'm1' });
	const listo = (quien, clave, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${RAIZ}/avisosAtendidos/${clave}`, fields: campos(o) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'fecha', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
	const quitar = (quien, clave) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ delete: `${RAIZ}/avisosAtendidos/${clave}` }] }) }).then((r) => r.status);
	const cambios = (por, agentId = 'a7') => ({ tipo: 'cambios', objeto: 'comA7', agentId, por });
	await espera('asesor marca «Listo» un pedido de cambios de otro asesor', listo('asesor9', 'cambios_comA7', cambios('asesor9', 'a9')), false);
	await espera('asesor marca «Listo» un pedido de otro asesor con el asesor de ese pedido', listo('asesor9', 'cambios_comA7', cambios('asesor9')), false);
	await espera('asesor marca «Listo» a nombre de otra persona', listo('asesor7', 'cambios_comA7', cambios('admin1')), false);
	await espera('asesor marca «Listo» con una clave que no es la del pedido', listo('asesor7', 'cambios_otro', cambios('asesor7')), false);
	await espera('asesor marca «Listo» un pedido que no existe', listo('asesor7', 'cambios_noExiste', { ...cambios('asesor7'), objeto: 'noExiste' }), false);
	await espera('asesor marca «Listo» con un campo de más', listo('asesor7', 'cambios_comA7', { ...cambios('asesor7'), nota: 'x' }), false);
	await espera('socio marca «Listo»', listo('socio1', 'cambios_comA7', cambios('socio1')), false);
	await espera('anónimo marca «Listo»', listo(null, 'cambios_comA7', cambios('x')), false);
	await espera('asesor marca «Listo» un pedido de su dueño (control)', listo('asesor7', 'cambios_comA7', cambios('asesor7')), true);
	await espera('nadie cambia un «Listo»', fetch(`${H}/avisosAtendidos/cambios_comA7?updateMask.fieldPaths=por`, { method: 'PATCH', headers: cab('admin1'), body: JSON.stringify({ fields: campos({ por: 'admin1' }) }) }).then((r) => r.status), false);
	await espera('otro asesor lee un «Listo» (sin datos de clientes)', leer('asesor9', 'avisosAtendidos/cambios_comA7'), true);
	await espera('socio lee un «Listo»', leer('socio1', 'avisosAtendidos/cambios_comA7'), false);
	await espera('otro asesor deshace un «Listo» ajeno', quitar('asesor9', 'cambios_comA7'), false);
	await espera('el asesor deshace su «Listo» (control)', quitar('asesor7', 'cambios_comA7'), true);
	const robo = { tipo: 'robo', objeto: 'lead1', agentId: '' };
	await espera('asesor marca «Listo» un «No se dio» con fechas ocupadas', listo('asesor7', 'robo_lead1', { ...robo, agentId: 'a7', por: 'asesor7' }), false);
	await espera('administrador marca «Listo» un «No se dio» de una solicitud que no existe', listo('admin1', 'robo_noExiste', { ...robo, objeto: 'noExiste', por: 'admin1' }), false);
	await espera('administrador marca «Listo» un «No se dio» con fechas ocupadas (control)', listo('admin1', 'robo_lead1', { ...robo, por: 'admin1' }), true);
	const exc = (por, agentId = 'a7', fin = '2026-12-01') => ({ tipo: 'exclusiva', objeto: 'casa-a7', fin, agentId, por });
	await espera('asesor marca «Listo» la exclusiva de una casa de otro asesor', listo('asesor9', 'exclusiva_casa-a7_2026-12-01', exc('asesor9', 'a9')), false);
	await espera('asesor marca «Listo» una exclusiva con otra fecha en la clave', listo('asesor7', 'exclusiva_casa-a7_2027-01-01', exc('asesor7')), false);
	await espera('asesor marca «Listo» una exclusiva con una fecha mal escrita', listo('asesor7', 'exclusiva_casa-a7_mañana', exc('asesor7', 'a7', 'mañana')), false);
	await espera('asesor marca «Listo» la exclusiva de su casa (control)', listo('asesor7', 'exclusiva_casa-a7_2026-12-01', exc('asesor7')), true);
	await espera('el administrador deshace un «Listo» de otro (control)', quitar('admin1', 'exclusiva_casa-a7_2026-12-01'), true);
}
// Montos congelados de una solicitud: solo el servidor los escribe; los leen el administrador y el socio de esa casa.
{
	await poner('montosSolicitud/lead1', { leadId: 'lead1', propertyId: 'prueba-casa-playa-monterrico', propietarioId: 'o1', moneda: 'USD', costoSocio: 300, alojamiento: 360, ganancia: 60 });
	await espera('administrador lee los montos de una solicitud', leer('admin1', 'montosSolicitud/lead1'), true);
	await espera('socio de la casa lee los montos de su solicitud', leer('socio1', 'montosSolicitud/lead1'), true);
	await espera('socio lista los montos de sus solicitudes', fetch(`${H}:runQuery`, { method: 'POST', headers: cab('socio1'), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'montosSolicitud' }], where: { fieldFilter: { field: { fieldPath: 'propietarioId' }, op: 'EQUAL', value: val('o1') } } } }) }).then((r) => r.status), true);
	await espera('otro socio lee los montos de una solicitud ajena', leer('socio2', 'montosSolicitud/lead1'), false);
	await espera('cliente sin sesión lee los montos', leer(null, 'montosSolicitud/lead1'), false);
	await espera('socio cambia los montos de su solicitud', fetch(`${H}/montosSolicitud/lead1`, { method: 'PATCH', headers: cab('socio1'), body: JSON.stringify({ fields: campos({ propietarioId: 'o1', costoSocio: 360 }) }) }).then((r) => r.status), false);
	await espera('administrador escribe montos a mano (solo el servidor)', crear('admin1', 'montosSolicitud/lead-n', { propietarioId: 'o1', costoSocio: 1 }), false);
}
// Cotizaciones con número seguido: el contador sube de 1 en 1, solo junto con la cotización que nace con ese número.
{
	const R = 'projects/demo-eq/databases/(default)/documents';
	const lote = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
	const ent = (n) => ({ integerValue: String(n) });
	const cot = (id, n, extra = {}) => ({ update: { name: `${R}/cotizaciones/${id}`, fields: { agentId: { stringValue: 'a7' }, numero: { stringValue: typeof n === 'number' ? `COT-${String(n).padStart(4, '0')}` : n.numero }, consecutivo: ent(typeof n === 'number' ? n : n.consecutivo), ...extra } }, currentDocument: { exists: false } });
	const cont = (n, id, existe) => ({ update: { name: `${R}/contadores/cotizaciones`, fields: { ultimo: ent(n), cotizacion: { stringValue: id } } }, currentDocument: { exists: existe } });
	await espera('asesor crea la primera cotización con el contador en 1', lote('asesor7', [cont(1, 'cot1', false), cot('cot1', 1)]), true);
	await espera('asesor crea una cotización sin el contador', lote('asesor7', [cot('cot-sin', 2)]), false);
	await espera('asesor salta un número (contador de 1 a 3)', lote('asesor7', [cont(3, 'cot3', true), cot('cot3', 3)]), false);
	await espera('asesor repite el número 1', lote('asesor7', [cont(1, 'cot1b', true), cot('cot1b', 1)]), false);
	await espera('asesor sube el contador sin crear su cotización', lote('asesor7', [cont(2, 'cot-nada', true)]), false);
	await espera('asesor sube el contador para una cotización que ya existe', lote('asesor7', [cont(2, 'cot1', true)]), false);
	await espera('asesor crea la 2 con otro número escrito («COT-0099»)', lote('asesor7', [cont(2, 'cot2', true), cot('cot2', { numero: 'COT-0099', consecutivo: 2 })]), false);
	await espera('asesor crea la 2 con el contador apuntando a otra cotización', lote('asesor7', [cont(2, 'otra', true), cot('cot2', 2)]), false);
	await espera('otro asesor crea la 2 (control: el número es de todos)', lote('asesor9', [cont(2, 'cot2', true), { update: { ...cot('cot2', 2).update, fields: { ...cot('cot2', 2).update.fields, agentId: { stringValue: 'a9' } } }, currentDocument: { exists: false } }]), true);
	await espera('el asesor cambia el número de su cotización', fetch(`${H}/cotizaciones/cot1?updateMask.fieldPaths=numero`, { method: 'PATCH', headers: cab('asesor7'), body: JSON.stringify({ fields: { numero: { stringValue: 'COT-0007' } } }) }).then((r) => r.status), false);
	await espera('el asesor edita otra cosa de su cotización (control)', fetch(`${H}/cotizaciones/cot1?updateMask.fieldPaths=notas`, { method: 'PATCH', headers: cab('asesor7'), body: JSON.stringify({ fields: { notas: { stringValue: 'Ajuste' } } }) }).then((r) => r.status), true);
	await espera('socio lee el contador', leer('socio1', 'contadores/cotizaciones'), false);
}
// Una casa nueva y su privado en un solo lote (admin/js/privado-casa.js crearCasa): o queda todo o nada.
{
	const R = 'projects/demo-eq/databases/(default)/documents';
	const lote = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
	const nueva = (id, f) => ({ update: { name: `${R}/properties/${id}`, fields: f }, currentDocument: { exists: false } });
	const priv = (id, doc, f) => ({ update: { name: `${R}/properties/${id}/privado/${doc}`, fields: f } });
	await espera('el administrador crea una casa por noche con su precio del socio y su llegada, juntos (control)', lote('admin1', [
		nueva('lote-noche', { titulo: { stringValue: 'Casa nueva' }, operacion: { stringValue: 'vacacional' }, agentId: { stringValue: '' }, publicado: { booleanValue: false } }),
		priv('lote-noche', 'socio', { precioBase: { integerValue: '100' } }), priv('lote-noche', 'llegada', { direccion: { stringValue: 'Km 98.5' } })]), true);
	await espera('el asesor crea su casa en venta con su acuerdo, juntos (control)', lote('asesor7', [
		nueva('lote-venta', { titulo: { stringValue: 'Casa en venta nueva' }, operacion: { stringValue: 'venta' }, agentId: { stringValue: 'a7' } }),
		priv('lote-venta', 'acuerdo', { exclusiva: { booleanValue: true } })]), true);
	await espera('el asesor crea una casa de otro asesor con su privado', lote('asesor7', [
		nueva('lote-ajena', { titulo: { stringValue: 'Ajena' }, operacion: { stringValue: 'venta' }, agentId: { stringValue: 'a9' } }),
		priv('lote-ajena', 'acuerdo', { exclusiva: { booleanValue: true } })]), false);
	await espera('el asesor escribe el privado de una casa de otro asesor', lote('asesor7', [priv('lote-noche', 'socio', { precioBase: { integerValue: '1' } })]), false);
}
// Bitácora de cambios sensibles en una casa (moneda, dueño, limpieza) y en una reserva («Revisé Airbnb»).
{
	const R = 'projects/demo-eq/databases/(default)/documents';
	const lote = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
	const foto = (moneda) => ({ mapValue: { fields: { moneda: svG(moneda), propietarioId: svG(''), limpieza: { integerValue: '0' }, precioBase: { integerValue: '0' }, precioFinde: { integerValue: '0' }, tarifas: { arrayValue: {} }, margen: { integerValue: '20' } } } });
	const renglon = (id, quien, casa, antes, despues, o = {}) => ({ update: { name: `${R}/bitacora/${id}`, fields: { tipo: svG('casa'), objeto: svG(casa), casa: svG(casa), antes, despues, quien: svG(quien), nombre: svG('X'), ...o } },
		currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] });
	const moneda = (casa, m, log) => ({ update: { name: `${R}/properties/${casa}`, fields: { moneda: svG(m), ...(log ? { bitacoraId: svG(log) } : {}) } }, updateMask: { fieldPaths: ['moneda', ...(log ? ['bitacoraId'] : [])] } });
	await poner('properties/bit-casa', { titulo: 'Casa de la bitácora', operacion: 'venta', agentId: 'a7', moneda: 'USD' });
	await espera('el administrador cambia la moneda de una casa sin su renglón', lote('admin1', [moneda('bit-casa', 'GTQ')]), false);
	await espera('el administrador cambia la moneda con un renglón que dice otra cosa', lote('admin1', [moneda('bit-casa', 'GTQ', 'bc1'), renglon('bc1', 'admin1', 'bit-casa', foto('USD'), foto('EUR'))]), false);
	await espera('el administrador cambia la moneda con un renglón de otra casa', lote('admin1', [moneda('bit-casa', 'GTQ', 'bc2'), renglon('bc2', 'admin1', 'prueba-casa-en-venta', foto('USD'), foto('GTQ'))]), false);
	await espera('el asesor de otra casa anota y cambia la moneda', lote('asesor9', [moneda('bit-casa', 'GTQ', 'bc3'), renglon('bc3', 'asesor9', 'bit-casa', foto('USD'), foto('GTQ'))]), false);
	await espera('el administrador cambia la moneda con su renglón (control)', lote('admin1', [moneda('bit-casa', 'GTQ', 'bc4'), renglon('bc4', 'admin1', 'bit-casa', foto('USD'), foto('GTQ'))]), true);
	await espera('el asesor de la casa cambia la moneda con su renglón (control)', lote('asesor7', [moneda('bit-casa', 'USD', 'bc5'), renglon('bc5', 'asesor7', 'bit-casa', foto('GTQ'), foto('USD'))]), true);
	await espera('el asesor de la casa cambia el título sin renglón (control: no es sensible)', lote('asesor7', [{ update: { name: `${R}/properties/bit-casa`, fields: { titulo: svG('Otro título') } }, updateMask: { fieldPaths: ['titulo'] } }]), true);
	await espera('un renglón sin cambio (antes igual a después)', lote('admin1', [renglon('bc6', 'admin1', 'bit-casa', foto('USD'), foto('USD'))]), false);
	await espera('un renglón suelto que nadie nombra', lote('admin1', [renglon('bc7', 'admin1', 'bit-casa', foto('USD'), foto('GTQ'))]), false);
	// Reserva con «Revisé Airbnb»: el administrador la crea con su renglón.
	const reserva = (id, log) => ({ update: { name: `${R}/reservas/${id}`, fields: { propertyId: svG('bit-casa'), estado: svG('confirmada'), revisadoAMano: { arrayValue: { values: [svG('Airbnb')] } }, ...(log ? { bitacoraId: svG(log) } : {}) } }, currentDocument: { exists: false } });
	const renglonReserva = (id, reservaId) => ({ update: { name: `${R}/bitacora/${id}`, fields: { tipo: svG('reserva'), objeto: svG(reservaId), casa: svG('bit-casa'), quien: svG('admin1'), nombre: svG('Admin'),
		antes: { mapValue: { fields: { revisadoAMano: { arrayValue: {} } } } }, despues: { mapValue: { fields: { revisadoAMano: { arrayValue: { values: [svG('Airbnb')] } } } } } } },
		currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'cuando', setToServerValue: 'REQUEST_TIME' }] });
	await espera('el administrador confirma con «Revisé Airbnb» sin su renglón', lote('admin1', [reserva('res-bit1')]), false);
	await espera('el administrador confirma con «Revisé Airbnb» y su renglón (control)', lote('admin1', [reserva('res-bit2', 'br2'), renglonReserva('br2', 'res-bit2')]), true);
}
// Revisión del comprobante con la IA: la escribe el servidor; la leen el administrador y el socio de esa casa.
{
	await poner('revisionesComprobante/lead1', { propietarioId: 'o1', propertyId: 'prueba-casa-playa-monterrico', texto: 'El comprobante cuadra', cuadra: true });
	await espera('el administrador lee la revisión del comprobante (control)', leer('admin1', 'revisionesComprobante/lead1'), true);
	await espera('el socio de la casa lee la revisión del comprobante (control)', leer('socio1', 'revisionesComprobante/lead1'), true);
	await espera('el socio de la casa busca sus revisiones (control)', consulta('socio1', 'revisionesComprobante', 'propietarioId', 'o1'), true);
	await espera('otro socio lee la revisión del comprobante', leer('socio2', 'revisionesComprobante/lead1'), false);
	await espera('anónimo lee la revisión del comprobante', leer(null, 'revisionesComprobante/lead1'), false);
	await espera('el administrador escribe una revisión del comprobante', crear('admin1', 'revisionesComprobante/lead9', { propietarioId: 'o1' }), false);
}
// Estado del sistema (netlify/lib/estado.mjs): lo escribe solo el servidor; lo lee el administrador.
{
	await poner('estado/correo', { motivo: 'prueba' });
	await espera('el administrador lee el estado del sistema (control)', leer('admin1', 'estado/correo'), true);
	await espera('el administrador lista el estado del sistema (control)', consulta('admin1', 'estado'), true);
	await espera('un asesor lee el estado del sistema', leer('asesor7', 'estado/correo'), false);
	await espera('un socio lee el estado del sistema', leer('socio1', 'estado/correo'), false);
	await espera('anónimo lee el estado del sistema', leer(null, 'estado/correo'), false);
	await espera('el administrador escribe el estado del sistema', crear('admin1', 'estado/otro', { motivo: 'x' }), false);
}
console.log(`\n${n - fallas} de ${n} correctos`);
if (fallas) process.exit(1);

