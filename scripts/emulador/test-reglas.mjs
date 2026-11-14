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
await espera('socio lee su propia ficha (notas y bitácora internas)', leer('socio1', 'propietarios/o1'), false);
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
	await espera('dueña mixta cambia el precio de su casa por noche', parche('mixto1', 'properties/mx-noche', ['precio', 'vacacional.base'], { precio: { doubleValue: 130 }, vacacional: { mapValue: { fields: { base: { doubleValue: 130 } } } } }), true);
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
	await espera('dueña crea una reserva de su casa por noche (control)', crear('mixto1', 'reservas/r-noche', { propertyId: 'mx-noche', propietarioId: 'm1', estado: 'confirmada' }), true);
	await raw('reservas/r-venta2', { propertyId: sv('mx-venta'), propietarioId: sv('m1'), estado: sv('confirmada') });
	await espera('dueña cancela una reserva de su casa en venta', parche('mixto1', 'reservas/r-venta2', ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('x') }), false);
	await raw('leads/lead-venta', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-venta'), propietarioId: sv('m1'), agentId: sv('a7') });
	await espera('dueña responde una «solicitud» de su casa en venta', parche('mixto1', 'leads/lead-venta', ['solicitud'], { solicitud: { mapValue: { fields: { estado: sv('confirmada') } } } }), false);
	const CV = 'ChatDeUnaCasaEnVentaLargoYAlAzar1234';
	await raw(`chats/${CV}`, { propietarioId: sv('m1'), propertyId: sv('mx-venta'), codigo: sv('EQ-V') });
	await espera('dueña escribe en un chat de su casa en venta', crear('mixto1', `chats/${CV}/mensajes/v1`, m('socio', 'Hola')), false);
	await espera('dueña confirma un chat de su casa en venta', parche('mixto1', `chats/${CV}`, ['estado'], { estado: sv('confirmada') }), false);
	await espera('dueña lee los mensajes de un chat de su casa en venta', leer('mixto1', `chats/${CV}/mensajes`), false);
	// El equipo: el asesor no crea ni cambia usuarios
	await espera('asesor crea un usuario', crear('asesor9', 'users/nuevo1', { rol: 'socio', activo: true, propietarioId: 'm1' }), false);
	await espera('asesor desactiva a un dueño', parche('asesor9', 'users/mixto1', ['activo'], { activo: { booleanValue: false } }), false);
}
console.log(`\n${n - fallas} de ${n} correctos`);
if (fallas) process.exit(1);

