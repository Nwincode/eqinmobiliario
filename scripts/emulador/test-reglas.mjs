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
await fetch(`${H}/leads/lead1`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { nombre: val('Ana Morales'), telefono: val('55551234'), email: val('ana@example.com'), propertyId: val('prueba-casa-playa-monterrico'), propietarioId: val('o1'), agentId: val(''), reserva: { mapValue: { fields: campos({ codigo: 'EQ-PRUEBA' }) } } } }) });
const T = 'TokenDePruebaLargoYAlAzar2345';
const chat = { leadId: 'lead1', codigo: 'EQ-PRUEBA', propertyId: 'prueba-casa-playa-monterrico', propertyTitulo: 'Casa de playa', propietarioId: 'o1', nombre: 'Ana', llegada: '2026-11-16', salida: '2026-11-20', noches: 4, huespedes: 2, total: 1122.4, moneda: 'USD', idioma: 'es' };
let fallas = 0, n = 0;
const espera = async (nombre, promesa, ok) => { const s = await promesa; const bien = ok ? s === 200 : s === 403 || s === 400; n++; if (!bien) fallas++; console.log(`${bien ? 'ok   ' : 'FALLA'} ${ok ? 'permite' : 'niega  '} · ${nombre} (${s})`); };
const m = (de, texto) => ({ de, texto });
let i = 0; const msj = () => `chats/${T}/mensajes/m${++i}`;

await espera('cliente abre el chat de su reserva', crear(null, `chats/${T}`, chat), true);
await espera('chat con token corto', crear(null, 'chats/corto', chat), false);
await espera('chat con un socio que no es el dueño de la casa', crear(null, 'chats/OtroTokenLargoYAlAzar23456789', { ...chat, propietarioId: 'o2' }), false);
await espera('chat con un teléfono como campo extra', crear(null, 'chats/OtroTokenLargoYAlAzar2345678A', { ...chat, telefono: '55551234' }), false);
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
await espera('socio dueño marca confirmada', act('socio1', { estado: 'confirmada' }), true);
await espera('socio dueño inventa un estado', act('socio1', { estado: 'regalada' }), false);
await espera('chat con foto y dirección de la ficha', crear(null, 'chats/TokenConFotoLargoYAlAzar2345', { ...chat, foto: 'https://ejemplo.com/a.jpg', url: '/propiedad/x/' }), true);
// El socio y los datos del cliente
await espera('socio dueño lee la solicitud (teléfono del cliente)', leer('socio1', 'leads/lead1'), false);
await espera('socio dueño lista las solicitudes de sus casas', consulta('socio1', 'leads', 'propietarioId', 'o1'), false);
await espera('socio dueño responde la solicitud sin leerla', fetch(`${H}/leads/lead1?updateMask.fieldPaths=solicitud`, { method: 'PATCH', headers: cab('socio1'), body: JSON.stringify({ fields: { solicitud: { mapValue: { fields: campos({ estado: 'confirmada' }) } } } }) }).then((r) => r.status), true);
await espera('administrador lee la solicitud', leer('admin1', 'leads/lead1'), true);
await espera('socio lee su propia ficha (datos de pago)', leer('socio1', 'propietarios/o1'), true);
await espera('socio lee la ficha de otro socio', leer('socio1', 'propietarios/o2'), false);
await espera('chat de un código que no es el de la solicitud', crear(null, 'chats/TokenOtroCodigoLargoAlAzar234', { ...chat, codigo: 'EQ-OTRO' }), false);
// Datos de pago
const pago = (de, texto) => ({ de, texto, tipo: 'pago' });
await espera('socio manda sus datos de pago guardados', crear('socio1', msj(), pago('socio', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno')), true);
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
await espera('socio dueño marca pago recibido', act('socio1', { estado: 'pagada' }), true);
await espera('socio cancela después de recibir el pago', act('socio1', { estado: 'cancelada' }), false);
await espera('socio regresa una pagada a confirmada', act('socio1', { estado: 'confirmada' }), false);
await espera('socio manda los datos de llegada (sin texto libre)', crear('socio1', msj(), { de: 'socio', tipo: 'llegada', texto: 'llegada' }), true);
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
	await espera('socio manda «llegada» con la dirección y el mapa guardados', crear('socio1', msj(), llegada('socio', dir)), true);
	await espera('socio mete una dirección en un mensaje normal', crear('socio1', msj(), { ...m('socio', 'Nos vemos'), direccion: 'Calle Real 12' }), false);
	await espera('socio mete un mapa en los datos de pago', crear('socio1', msj(), { ...pago('socio', 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno'), mapa: 'x' }), false);
	await espera('cliente mete una dirección en su mensaje', crear(null, msj(), { ...m('cliente', 'Hola'), direccion: 'x' }), false);
}
await espera('cliente adjunta la foto de su comprobante', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: foto(T) }), true);
await espera('cliente manda como foto un enlace de otro sitio', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: 'https://ejemplo.com/foto.jpg' }), false);
await espera('cliente manda una foto de otra reserva', crear(null, msj(), { de: 'cliente', tipo: 'foto', texto: foto('OtroTokenLargoYAlAzar23456789') }), false);
await espera('socio manda una foto', crear('socio1', msj(), { de: 'socio', tipo: 'foto', texto: foto(T) }), false);
// Reserva cancelada por el administrador: el socio ya no escribe ni la revive
await espera('administrador cancela', act('admin1', { estado: 'cancelada' }), true);
await espera('socio escribe en una reserva cancelada', crear('socio1', msj(), m('socio', 'La casa queda en Calle Real 12')), false);
await espera('socio revive una cancelada', act('socio1', { estado: 'confirmada' }), false);
await espera('equipo sí escribe en una cancelada', crear('admin1', msj(), m('equipo', 'Lamentamos la cancelación.')), true);
// Lotes: dentro de un mismo lote las reglas ven el estado ANTERIOR. «Pago recibido» junto (estado + llegada)
// se rechaza —por eso el panel lo hace en dos pasos—; «Confirmar» junto (estado + datos de pago) sí pasa.
{
	const R = 'projects/demo-eq/databases/(default)/documents';
	const L = 'TokenLoteDePruebaLargo123456';
	const lote = async (estadoAntes, writes) => {
		await fetch(`${H}/chats/${L}`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: campos({ propietarioId: 'o1', propertyId: 'prueba-casa-playa-monterrico', codigo: 'EQ-L', ...(estadoAntes ? { estado: estadoAntes } : {}) }) }) });
		return fetch(`${H}:commit`, { method: 'POST', headers: cab('socio1'), body: JSON.stringify({ writes }) }).then((x) => x.status);
	};
	const estado = (v) => ({ update: { name: `${R}/chats/${L}`, fields: campos({ estado: v }) }, updateMask: { fieldPaths: ['estado'] }, currentDocument: { exists: true } });
	const mensaje = (id, f) => ({ update: { name: `${R}/chats/${L}/mensajes/${id}`, fields: campos(f) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
	await espera('lote «pago recibido» (estado + llegada juntos)', lote('confirmada', [estado('pagada'), mensaje('l1', { de: 'socio', tipo: 'llegada', texto: 'llegada' })]), false);
	await espera('lote «pago recibido» con la dirección correcta, junto al estado', lote('confirmada', [estado('pagada'), mensaje('l2', { de: 'socio', tipo: 'llegada', texto: 'llegada', direccion: 'Calle Real 12, Monterrico', mapa: 'https://maps.google.com/?q=13.8912,-90.4801' })]), false);
	await espera('lote «confirmar» (estado + datos de pago juntos)', lote('', [estado('confirmada'), mensaje('p1', { de: 'socio', tipo: 'pago', texto: 'Banco Industrial, cuenta monetaria 123-456789-0, a nombre de Socio Uno' })]), true);
}
console.log(`\n${n - fallas} de ${n} correctos`);
if (fallas) process.exit(1);

