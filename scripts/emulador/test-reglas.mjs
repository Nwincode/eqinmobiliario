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
let fallas = 0, n = 0;
const espera = async (nombre, promesa, ok) => { const s = await promesa; const bien = ok ? s === 200 : s === 403; n++; if (!bien) fallas++; console.log(`${bien ? 'ok   ' : 'FALLA'} ${ok ? 'permite' : 'niega  '} · ${nombre} (${s})`); };
const m = (de, texto) => ({ de, texto });
let i = 0; const msj = () => `chats/${T}/mensajes/m${++i}`;

// El chat nace junto con su índice chatsPorSolicitud/{solicitud} (js/reserva-chat.js crear): uno por solicitud.
const RAIZ = 'projects/demo-eq/databases/(default)/documents';
const crearChat = (token, o, { indice = true, lead = o.leadId, encima = false } = {}) => fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes: [
	{ update: { name: `${RAIZ}/chats/${token}`, fields: campos(o) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
	...(indice ? [{ update: { name: `${RAIZ}/chatsPorSolicitud/${lead}`, fields: campos({ token }) }, ...(encima ? {} : { currentDocument: { exists: false } }) }] : [])] }) }).then((r) => r.status);
await espera('cliente abre el chat de su reserva, con su índice', crearChat(T, chat), true);
// (Con «no existe» la base lo rechaza antes de las reglas (409); escribiendo encima del índice, lo niegan las reglas.)
await espera('segundo chat para la misma solicitud, escribiendo encima de su índice', crearChat('SegundoChatLargoYAlAzar234567', chat, { encima: true }), false);
await espera('segundo chat para la misma solicitud, sin índice', crearChat('SegundoChatLargoYAlAzar234568', chat, { indice: false }), false);
await espera('nadie cambia el índice de una solicitud a otro chat', fetch(`${H}/chatsPorSolicitud/lead1`, { method: 'PATCH', headers: cab(null), body: JSON.stringify({ fields: campos({ token: 'OtroChat' }) }) }).then((r) => r.status), false);
await espera('anónimo lee el índice', leer(null, 'chatsPorSolicitud/lead1'), false);
await espera('administrador lee el índice (control)', leer('admin1', 'chatsPorSolicitud/lead1'), true);
{
	const probar = await leer(null, `chatsPorSolicitud/prueba-${Math.random().toString(36).slice(2)}`);
	n++; if (probar !== 404) fallas++; console.log(`${probar === 404 ? 'ok   ' : 'FALLA'} 404    · leer un índice que no existe responde «no existe» (así el sitio sabe que las reglas son las nuevas) (${probar})`);
}
// Solicitud de antes (sin índice): su chat ya existe. Nadie le inventa otro chat con su índice ni le pone índice a un
// chat ya existente; solo el administrador, al chat de esa solicitud (Solicitudes lo hace al abrirla).
{
	const viejo = new Date(Date.now() - 3 * 86400_000).toISOString();
	await fetch(`${H}/leads/lead-vieja`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: viejo }, nombre: val('Vieja'), telefono: val('5555'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: cotizada('EQ-VJA') } }) });
	const CV = 'ChatDeUnaSolicitudDeAntesLargo123';
	await poner(`chats/${CV}`, { ...chat, leadId: 'lead-vieja', codigo: 'EQ-VJA' });
	const indice = (quien, token) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${RAIZ}/chatsPorSolicitud/lead-vieja`, fields: campos({ token }) }, currentDocument: { exists: false } }] }) }).then((r) => r.status);
	await espera('chat inventado con su índice para una solicitud de antes', crearChat('ChatFalsoDeAntesLargoYAlAzar2', { ...chat, leadId: 'lead-vieja', codigo: 'EQ-VJA' }), false);
	await espera('anónimo pone el índice de una solicitud de antes a su chat ya existente', indice(null, CV), false);
	await espera('socio pone el índice de una solicitud de antes', indice('socio1', CV), false);
	await espera('administrador pone el índice de una solicitud de antes a un chat de otra solicitud', indice('admin1', T), false);
	await espera('administrador pone el índice de una solicitud de antes a su chat (control)', indice('admin1', CV), true);
	await espera('administrador lista los índices (control)', consulta('admin1', 'chatsPorSolicitud'), true);
}
// Otra solicitud (sin chat todavía) para los chats mal hechos: cada uno falla solo por lo que tiene mal.
await fetch(`${H}/leads/lead-n`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: new Date().toISOString() }, nombre: val('Beto'), telefono: val('55550000'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: cotizada('EQ-PRUEBA') } }) });
const chatN = { ...chat, leadId: 'lead-n' };
await espera('chat con token corto', crearChat('corto', chatN), false);
await espera('chat con un socio que no es el dueño de la casa', crearChat('OtroTokenLargoYAlAzar23456789', { ...chatN, propietarioId: 'o2' }), false);
await espera('chat con un teléfono como campo extra', crearChat('OtroTokenLargoYAlAzar2345678A', { ...chatN, telefono: '55551234' }), false);
await poner('properties/otra-casa-noche', { titulo: 'Otra casa', operacion: 'vacacional', publicado: true, propietarioId: 'o1' });
await espera('chat de otra casa que la de la solicitud', crearChat('TokenOtraCasaLargoYAlAzar2345', { ...chatN, propertyId: 'otra-casa-noche', propertyTitulo: 'Otra casa' }), false);
await espera('chat de un código que no es el de la solicitud', crearChat('TokenOtroCodigoLargoAlAzar234', { ...chatN, codigo: 'EQ-OTRO' }), false);
await espera('chat cuyo índice apunta a otro chat', fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes: [
	{ update: { name: `${RAIZ}/chats/TokenIndiceAjenoLargoYAlAzar23`, fields: campos(chatN) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] },
	{ update: { name: `${RAIZ}/chatsPorSolicitud/lead-n`, fields: campos({ token: T }) }, currentDocument: { exists: false } }] }) }).then((r) => r.status), false);
// El título no se compara con el de la casa (una página publicada antes de cambiarlo no abriría el chat): los correos lo toman de la casa.
// El chat lleva el subtotal cotizado (con él confirma el socio): el de su solicitud.
{
	await fetch(`${H}/leads/lead-s`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: new Date().toISOString() }, nombre: val('Sara'), telefono: val('55550000'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: cotizada('EQ-PRUEBA') } }) });
	await espera('chat con un subtotal distinto del de su solicitud', crearChat('TokenSubtotalMaloLargoYAlAzar2', { ...chat, leadId: 'lead-s', subtotal: 9200 }), false);
	await espera('chat con otro número de huéspedes que su solicitud', crearChat('TokenHuespedMaloLargoYAlAzar2', { ...chat, leadId: 'lead-s', huespedes: 10 }), false);
	await espera('chat con el subtotal de su solicitud (control)', crearChat('TokenSubtotalBienLargoYAlAzar2', { ...chat, leadId: 'lead-s', subtotal: 920 }), true);
	const r5 = await leer(null, 'reglas/r5');
	n++; if (r5 !== 404) fallas++; console.log(`${r5 === 404 ? 'ok   ' : 'FALLA'} 404    · leer reglas/r5 responde «no existe» (así el sitio sabe que puede mandar el subtotal) (${r5})`);
	await espera('nadie escribe en reglas/r5', fetch(`${H}/reglas/r5`, { method: 'PATCH', headers: cab(null), body: JSON.stringify({ fields: campos({ x: 1 }) }) }).then((r) => r.status), false);
}
// El chat es lo que ve el socio en Solicitudes: fechas, noches, total, moneda y subtotal iguales a los de su solicitud
// (el servidor confirma con los de la solicitud: si no, el socio confirmaría una cosa y se guardaría otra).
{
	await fetch(`${H}/leads/lead-a1`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { createdAt: { timestampValue: new Date().toISOString() }, nombre: val('Carla'), telefono: val('55550000'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: cotizada('EQ-PRUEBA') } }) });
	const chatA1 = { ...chat, leadId: 'lead-a1' };
	await espera('chat con otra llegada que su solicitud', crearChat('TokenA1LlegadaLargoYAlAzar2345', { ...chatA1, llegada: '2027-02-03' }), false);
	await espera('chat con otra salida que su solicitud', crearChat('TokenA1SalidaLargoYAlAzar23456', { ...chatA1, salida: '2026-11-17' }), false);
	await espera('chat con menos noches que su solicitud', crearChat('TokenA1NochesLargoYAlAzar23456', { ...chatA1, noches: 1 }), false);
	await espera('chat con un total más bajo que su solicitud', crearChat('TokenA1TotalLargoYAlAzar234567', { ...chatA1, total: 122 }), false);
	await espera('chat en otra moneda que su solicitud', crearChat('TokenA1MonedaLargoYAlAzar23456', { ...chatA1, moneda: 'GTQ' }), false);
	await espera('chat sin el subtotal cotizado', crearChat('TokenA1SinSubLargoYAlAzar23456', (({ subtotal, ...x }) => x)(chatA1)), false);
	await espera('chat igual a su solicitud (control)', crearChat('TokenA1BienLargoYAlAzar2345678', chatA1), true);
}
await espera('chat con foto, dirección de la ficha y un título de antes (control)', crearChat('TokenConFotoLargoYAlAzar2345', { ...chatN, propertyTitulo: 'Título de antes', foto: 'https://ejemplo.com/a.jpg', url: '/propiedad/x/' }), true);
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
		const juntos = (quien, writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes }) }).then((r) => r.status);
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
		await espera('el administrador apaga un permiso para todos', parche('admin1', 'settings/permisosSocios', ['precios'], { precios: { booleanValue: false } }), true);
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
		const truco = await fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes: [
			{ update: { name: `${R}/properties/mx-noche/privado/socio`, fields: { tarifas: lista([viejo(1)]) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: { mapValue: { fields: { tarifas: lista([viejo(1.2)]) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }] }) }).then((r) => r.status);
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
		const puso = await fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes: [
			{ update: { name: `${R}/properties/mx-noche/privado/socio`, fields: { tarifas: lista(diez) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: { mapValue: { fields: { tarifas: lista(diez.map((x) => ({ ...x, precio: Math.round(x.precio * 120) / 100 }))) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }] }) }).then((r) => r.status);
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
		const escribir = (soc, publico) => fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes: [
			{ update: { name: `${R}/properties/mx-noche-12/privado/socio`, fields: { tarifas: lista(soc) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche-12`, fields: { vacacional: { mapValue: { fields: { tarifas: lista(publico) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }] }) }).then((r) => r.status);
		const otro = [...doce.slice(1, 11), { ...doce[0], precio: 1 }];
		await espera('dueña con 12 precios por fechas cambia uno (11 que no estaban así)', escribir(otro, pub(otro)), false);
		await espera('dueña con 12 precios por fechas quita uno (control)', escribir(doce.slice(1), pub(doce.slice(1))), true);
	}
	// Un formulario lleva el asesor de su casa: una página vieja no le manda la solicitud de una casa por noche al asesor.
	{
		const lead = (agentId) => ({ nombre: 'Ana', telefono: '+502 5555 1234', email: '', mensaje: '', origen: 'reserva', pagina: '/x/', propertyId: 'mx-noche', propertyTitulo: 'Casa', agentId, estado: 'nuevo' });
		await espera('formulario de una casa por noche con el asesor de una página vieja', crear(null, 'leads/lead-pagina-vieja', lead('a7')), false);
		await espera('formulario de una casa por noche sin asesor (control)', crear(null, 'leads/lead-pagina-nueva', lead('')), true);
		// La cotización de la solicitud (js/vacacional.js con V.cotizar): números, impuestos = 22 % y total = subtotal + impuestos.
		const conReserva = (id, r) => fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes: [{ update: { name: `${R}/leads/${id}`,
			fields: { ...campos(lead('')), reserva: { mapValue: { fields: Object.fromEntries(Object.entries(r).map(([k, x]) => [k, typeof x === 'number' ? { doubleValue: x } : sv(x)])) } } } },
			currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((x) => x.status);
		const bien = { codigo: 'EQ-COT', llegada: '2027-03-01', salida: '2027-03-04', noches: 3, huespedes: 2, subtotal: 400, impuestos: 88, total: 488, deposito: 0, moneda: 'USD' };
		// Inflar el subtotal sin inflar los impuestos ni el total no pasa (el cliente vería y pagaría otra cosa).
		await espera('solicitud con el subtotal inflado y los impuestos y el total de antes', conReserva('lead-cot-1', { ...bien, subtotal: 100000 }), false);
		// Inflado pero coherente (100,000 + 22,000 = 122,000) sí pasa la regla: lo frena «Confirmada», donde el
		// administrador elige registrar con los precios de hoy (montosDeConfirmacion). Se deja probado para que se sepa.
		await espera('solicitud inflada pero coherente: la regla la deja (la frena el administrador al confirmar)', conReserva('lead-cot-9', { ...bien, subtotal: 100000, impuestos: 22000, total: 122000 }), true);
		await espera('solicitud de 3 noches que declara 1 (menos comisión)', conReserva('lead-cot-10', { ...bien, noches: 1, subtotal: 100, impuestos: 22, total: 122 }), false);
		await espera('solicitud con fechas que no son fechas', conReserva('lead-cot-11', { ...bien, llegada: 'mañana' }), false);
		await espera('solicitud de un mes que cruza de año, con sus 31 noches (control)', conReserva('lead-cot-12', { ...bien, llegada: '2026-12-15', salida: '2027-01-15', noches: 31 }), true);
		await espera('solicitud con impuestos que no son el 22 %', conReserva('lead-cot-2', { ...bien, impuestos: 10, total: 410 }), false);
		await espera('solicitud con un total que no es subtotal + impuestos', conReserva('lead-cot-3', { ...bien, total: 1 }), false);
		await espera('solicitud con el subtotal como texto', conReserva('lead-cot-4', { ...bien, subtotal: 'mucho' }), false);
		await espera('solicitud sin subtotal', conReserva('lead-cot-5', (({ subtotal, ...x }) => x)(bien)), false);
		await espera('solicitud con 2.5 noches', conReserva('lead-cot-6', { ...bien, noches: 2.5 }), false);
		await espera('solicitud en cero (nada que cobrar)', conReserva('lead-cot-13', { ...bien, subtotal: 0, impuestos: 0, total: 0 }), false);
		await espera('solicitud de 91 noches (más que el tope de la ficha)', conReserva('lead-cot-14', { ...bien, llegada: '2027-03-01', salida: '2027-05-31', noches: 91, subtotal: 9100, impuestos: 2002, total: 11102 }), false);
		await espera('solicitud de 90 noches (control)', conReserva('lead-cot-15', { ...bien, llegada: '2027-03-01', salida: '2027-05-30', noches: 90, subtotal: 9000, impuestos: 1980, total: 10980 }), true);
		await espera('solicitud con 0 noches', conReserva('lead-cot-7', { ...bien, noches: 0 }), false);
		await espera('solicitud con el subtotal negativo', conReserva('lead-cot-8', { ...bien, subtotal: -100, impuestos: -22, total: -122 }), false);
		await espera('solicitud cotizada como la cotiza el sitio, con centavos (control)', conReserva('lead-cot-ok', { ...bien, subtotal: 433.33, impuestos: 95.33, total: 528.66 }), true);
		// La moneda es la de la casa (de ella salen la reserva y la comisión); sin moneda guardada, US$.
		await espera('solicitud en quetzales de una casa en dólares (sin moneda guardada)', conReserva('lead-mon-1', { ...bien, moneda: 'GTQ' }), false);
		await espera('solicitud sin moneda', conReserva('lead-mon-2', (({ moneda, ...x }) => x)(bien)), false);
		await raw('properties/mx-noche-q', { titulo: sv('Casa por noche en quetzales'), operacion: sv('vacacional'), propietarioId: sv('m1'), moneda: sv('GTQ') });
		await raw('properties/mx-noche-vacia', { titulo: sv('Casa por noche con la moneda vacía'), operacion: sv('vacacional'), propietarioId: sv('m1'), moneda: sv('') });
		const enCasa = (id, casa, r) => fetch(`${H}:commit`, { method: 'POST', headers: cab(null), body: JSON.stringify({ writes: [{ update: { name: `${R}/leads/${id}`,
			fields: { ...campos({ ...lead(''), propertyId: casa }), reserva: { mapValue: { fields: Object.fromEntries(Object.entries(r).map(([k, x]) => [k, typeof x === 'number' ? { doubleValue: x } : sv(x)])) } } } },
			currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((x) => x.status);
		await espera('solicitud en dólares de una casa en quetzales', enCasa('lead-mon-3', 'mx-noche-q', bien), false);
		await espera('solicitud en quetzales de una casa en quetzales (control)', enCasa('lead-mon-4', 'mx-noche-q', { ...bien, moneda: 'GTQ' }), true);
		await espera('solicitud en dólares de una casa con la moneda vacía (control)', enCasa('lead-mon-5', 'mx-noche-vacia', bien), true);
		await espera('solicitud de una casa que no existe', enCasa('lead-mon-6', 'no-existe', bien), false);
		// Las personas caben en la casa (huespedesMax de la casa; sin él, sin tope).
		await raw('properties/mx-noche-4p', { titulo: sv('Casa para 4'), operacion: sv('vacacional'), propietarioId: sv('m1'), moneda: sv('USD'), vacacional: { mapValue: { fields: { huespedesMax: { integerValue: '4' } } } } });
		await espera('solicitud de 6 personas en una casa para 4', enCasa('lead-hue-1', 'mx-noche-4p', { ...bien, huespedes: 6 }), false);
		await espera('solicitud de 0 personas', enCasa('lead-hue-2', 'mx-noche-4p', { ...bien, huespedes: 0 }), false);
		await espera('solicitud de 4 personas en una casa para 4 (control)', enCasa('lead-hue-3', 'mx-noche-4p', { ...bien, huespedes: 4 }), true);
		await espera('solicitud de 9 personas en una casa sin tope guardado (control)', conReserva('lead-hue-4', { ...bien, huespedes: 9 }), true);
		await raw('properties/mx-noche-texto', { titulo: sv('Casa con el tope como texto'), operacion: sv('vacacional'), propietarioId: sv('m1'), moneda: sv('USD'), vacacional: { mapValue: { fields: { huespedesMax: sv('4') } } } });
		await espera('casa de antes con el tope guardado como texto: no rechaza todas sus solicitudes (control)', enCasa('lead-hue-5', 'mx-noche-texto', { ...bien, huespedes: 3 }), true);
		await raw('properties/mx-noche-cero', { titulo: sv('Casa con el tope en 0'), operacion: sv('vacacional'), propietarioId: sv('m1'), moneda: sv('USD'), vacacional: { mapValue: { fields: { huespedesMax: { integerValue: '0' } } } } });
		await espera('casa con el tope en 0 (dato malo): sin tope, como la ficha (control)', enCasa('lead-hue-6', 'mx-noche-cero', { ...bien, huespedes: 3 }), true);
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
	await espera('el administrador devuelve los permisos en la ficha del dueño (control)', parche('admin1', 'propietarios/m1', ['permisos'], { permisos: { mapValue: { fields: { devolver: { booleanValue: false } } } } }), true);
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
		const resumen = (quien, token, propietarioId, agentId) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/portalPropietarios/${token}`,
			fields: { email: sv('x@example.com'), agentId: sv(agentId), propietarioId: sv(propietarioId), propiedades: { arrayValue: { values: [] } } } }, currentDocument: { exists: false } }] }) }).then((r) => r.status);
		await espera('un asesor arma el resumen de una persona de otro asesor', resumen('asesor7', 'ResumenAjenoDeOtroAsesorLargoYAlAzar12', 'o2', 'a7'), false);
		await espera('un asesor arma el resumen de una persona suya (control)', resumen('asesor7', 'ResumenPropioDelAsesorLargoYAlAzar1234', 'm1', 'a7'), true);
	}
	// Casa por noche sin privado/socio todavía: el dueño lo crea con sus precios, junto con el público y con el margen.
	{
		const juntos = (writes) => fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes }) }).then((r) => r.status);
		const suyo = (f) => ({ update: { name: `${R}/properties/mx-noche-sin-precio/privado/socio`, fields: f }, currentDocument: { exists: false } });
		const publico = (n) => ({ update: { name: `${R}/properties/mx-noche-sin-precio`, fields: { vacacional: { mapValue: { fields: { base: { integerValue: String(n) } } } } } }, updateMask: { fieldPaths: ['vacacional.base'] } });
		await espera('dueña crea su precio sin el margen en el público', juntos([suyo({ precioBase: { integerValue: '100' } }), publico(100)]), false);
		await espera('dueña crea su precio poniéndose el margen', juntos([suyo({ precioBase: { integerValue: '100' }, margen: { integerValue: '0' } }), publico(100)]), false);
		await espera('dueña crea su precio con el público y el margen (control)', juntos([suyo({ precioBase: { integerValue: '100' } }), publico(120)]), true);
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
console.log(`\n${n - fallas} de ${n} correctos`);
if (fallas) process.exit(1);

