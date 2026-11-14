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
const chat = { leadId: 'lead1', codigo: 'EQ-PRUEBA', propertyId: 'prueba-casa-playa-monterrico', propertyTitulo: 'Casa de playa en Monterrico (prueba)', propietarioId: 'o1', nombre: 'Ana', llegada: '2026-11-16', salida: '2026-11-20', noches: 4, huespedes: 2, total: 1122.4, moneda: 'USD', idioma: 'es' };
let fallas = 0, n = 0;
const espera = async (nombre, promesa, ok) => { const s = await promesa; const bien = ok ? s === 200 : s === 403; n++; if (!bien) fallas++; console.log(`${bien ? 'ok   ' : 'FALLA'} ${ok ? 'permite' : 'niega  '} · ${nombre} (${s})`); };
const m = (de, texto) => ({ de, texto });
let i = 0; const msj = () => `chats/${T}/mensajes/m${++i}`;

await espera('cliente abre el chat de su reserva', crear(null, `chats/${T}`, chat), true);
await espera('chat con token corto', crear(null, 'chats/corto', chat), false);
await espera('chat con un socio que no es el dueño de la casa', crear(null, 'chats/OtroTokenLargoYAlAzar23456789', { ...chat, propietarioId: 'o2' }), false);
await espera('chat con un teléfono como campo extra', crear(null, 'chats/OtroTokenLargoYAlAzar2345678A', { ...chat, telefono: '55551234' }), false);
// El título y la casa del chat son los de la solicitud y la casa guardada: el correo «Recibimos tu solicitud» no lleva texto libre.
await espera('chat con un título inventado (texto para un correo)', crear(null, 'chats/TokenTituloLibreLargoYAlAzar23', { ...chat, propertyTitulo: 'Gana dinero en estafa.example' }), false);
await poner('properties/otra-casa-noche', { titulo: 'Otra casa', operacion: 'vacacional', publicado: true, propietarioId: 'o1' });
await espera('chat de otra casa que la de la solicitud', crear(null, 'chats/TokenOtraCasaLargoYAlAzar2345', { ...chat, propertyId: 'otra-casa-noche', propertyTitulo: 'Otra casa' }), false);
await fetch(`${H}/properties/prueba-casa-playa-monterrico?updateMask.fieldPaths=en`, { method: 'PATCH', headers: cab('dueño'), body: JSON.stringify({ fields: { en: { mapValue: { fields: campos({ titulo: 'Beach house in Monterrico (test)' }) } } } }) });
await espera('chat desde la página en inglés, con el título en inglés de la casa (control)', crear(null, 'chats/TokenTituloInglesLargoYAlAzar2', { ...chat, propertyTitulo: 'Beach house in Monterrico (test)', idioma: 'en' }), true);
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
const solicitudDe = (quien, ruta, f) => fetch(`${H}/${ruta}?updateMask.fieldPaths=solicitud`, { method: 'PATCH', headers: cab(quien), body: JSON.stringify({ fields: { solicitud: { mapValue: { fields: campos(f) } } } }) }).then((r) => r.status);
await espera('socio regresa la solicitud a «sin responder»', solicitudDe('socio1', 'leads/lead1', { estado: 'pendiente' }), false);
await espera('socio pasa una confirmada a «no se dio»', solicitudDe('socio1', 'leads/lead1', { estado: 'no' }), false);
await espera('socio mete otro campo en la solicitud', solicitudDe('socio1', 'leads/lead1', { estado: 'cancelada', telefono: '5555 0001' }), false);
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
	// La reserva que crea el socio al confirmar (admin/js/reservas.js confirmarSolicitud): de una solicitud real, con la comisión entera.
	const vv = (v) => (v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, vv(x)])) } } : val(v));
	const crearR = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/${ruta}`, fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, vv(x)])) }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
	// Lo mismo sin la condición de «no existe»: como lo hace la app (set), que sobre una reserva que ya existe es un cambio.
	const escribirR = (quien, ruta, o) => fetch(`${H}:commit`, { method: 'POST', headers: cab(quien), body: JSON.stringify({ writes: [{ update: { name: `${R}/${ruta}`, fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, vv(x)])) }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }) }).then((r) => r.status);
	await raw('leads/lead-res-noche', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1'), reserva: { mapValue: { fields: { codigo: sv('EQ-RN'), llegada: sv('2026-12-01'), salida: sv('2026-12-04'), noches: { integerValue: '3' } } } } });
	const delSocio = (extra = {}, comision = {}) => ({ propertyId: 'mx-noche', propertyTitulo: 'Casa por noche', agentId: '', propietarioId: 'm1', moneda: 'USD', llegada: '2026-12-01', salida: '2026-12-04', noches: 3,
		huesped: 'Ana', canal: 'web', estado: 'confirmada', leadId: 'lead-res-noche', codigo: 'EQ-RN', chat: 'ChatDeLaReservaRNLargoYAlAzar1', costoSocio: 300, alojamiento: 360, ganancia: 60, pagadoSocio: false, pagadoFecha: '',
		...extra, comision: { monto: extra.ganancia ?? 60, vence: '2026-12-01', pagada: false, ...comision } });
	await raw('chats/ChatDeLaReservaRNLargoYAlAzar1', { leadId: sv('lead-res-noche'), codigo: sv('EQ-RN'), propietarioId: sv('m1'), propertyId: sv('mx-noche') });
	await raw('chats/ChatDeLaReservaRN2LargoYAlAzar', { leadId: sv('lead-res-noche2'), codigo: sv('EQ-RN2'), propietarioId: sv('m1'), propertyId: sv('mx-noche') });
	await espera('dueña crea la reserva sin su chat', crearR('mixto1', 'reservas/lead-res-noche', (({ chat, ...x }) => x)(delSocio())), false);
	await espera('dueña crea la reserva con el chat de otra solicitud', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ chat: 'ChatDeLaReservaRN2LargoYAlAzar' })), false);
	await espera('dueña crea la reserva con la comisión ya pagada', crearR('mixto1', 'reservas/lead-res-noche', delSocio({}, { pagada: true })), false);
	await espera('dueña crea la reserva con una comisión menor que la ganancia', crearR('mixto1', 'reservas/lead-res-noche', delSocio({}, { monto: 1 })), false);
	await espera('dueña crea la reserva con una ganancia menor que el margen de la casa', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ alojamiento: 301, ganancia: 1 })), false);
	await espera('dueña crea la reserva ya pagada a ella', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ pagadoSocio: true })), false);
	await espera('dueña crea la reserva con un campo del equipo (notas)', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ notas: 'x' })), false);
	await espera('dueña crea la reserva para el asesor que elija', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ agentId: 'a9' })), false);
	await espera('dueña crea la reserva con otras fechas que las de la solicitud', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ salida: '2026-12-10' })), false);
	await espera('dueña crea la reserva sin solicitud', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ leadId: 'no-existe' })), false);
	await espera('dueña crea la reserva con otro id que el de la solicitud', crearR('mixto1', 'reservas/r-otro-id', delSocio()), false);
	await espera('dueña infla las noches para anular el margen', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ noches: 1e9, costoSocio: 360, ganancia: 0 }, { monto: 0 })), false);
	// Su noche más barata para esas fechas: base o fin de semana (100); sus precios por fechas de 2027 no tocan diciembre.
	// Truco: un precio por fechas viejo de 1 (en los dos documentos, cuadra con el margen) no baja el piso.
	{
		const mapa = (o) => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'number' ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x }) : sv(x)])) } });
		const lista = (xs) => ({ arrayValue: { values: xs.map(mapa) } });
		const viejo = (precio) => ({ desde: '2000-01-01', hasta: '2000-01-01', precio });
		const truco = await fetch(`${H}:commit`, { method: 'POST', headers: cab('mixto1'), body: JSON.stringify({ writes: [
			{ update: { name: `${R}/properties/mx-noche/privado/socio`, fields: { tarifas: lista([viejo(1)]) } }, updateMask: { fieldPaths: ['tarifas'] } },
			{ update: { name: `${R}/properties/mx-noche`, fields: { vacacional: { mapValue: { fields: { tarifas: lista([viejo(1.2)]) } } } } }, updateMask: { fieldPaths: ['vacacional.tarifas'] } }] }) }).then((r) => r.status);
		await espera('dueña pone un precio por fechas viejo de 1 en los dos documentos (cuadra con el margen)', Promise.resolve(truco), true);
		await espera('dueña crea la reserva con su parte = noches × ese precio viejo', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ costoSocio: 3, alojamiento: 3.6, ganancia: 0.6 }, { monto: 0.6 })), false);
	}
	await espera('dueña crea la reserva con su parte menor que su noche más barata', crearR('mixto1', 'reservas/lead-res-noche', delSocio({ costoSocio: 30, alojamiento: 36, ganancia: 6 }, { monto: 6 })), false);
	await espera('dueña crea una reserva de su casa por noche al confirmar (control)', crearR('mixto1', 'reservas/lead-res-noche', delSocio()), true);
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
	// Cancelar: el socio solo mientras el cliente no ha pagado (reserva y chat «confirmada») y antes del día de llegada
	// (de Guatemala). Si no, la comisión saldría de la mora y la casa no se pausaría.
	{
		const gt = (d) => new Date(Date.now() - 6 * 3600_000 + d * 86400_000).toISOString().slice(0, 10);
		const cancelable = async (id, { chatEstado = 'confirmada', llegada = gt(10), conChat = true, chatLead = id } = {}) => {
			const C = `ChatCancelar${id.replace(/[^A-Za-z0-9]/g, '')}LargoYAlAzar123`;
			await raw(`chats/${C}`, { leadId: sv(chatLead), codigo: sv(`EQ-${id}`), propietarioId: sv('m1'), propertyId: sv('mx-noche'), estado: sv(chatEstado) });
			await raw(`reservas/${id}`, { propertyId: sv('mx-noche'), propietarioId: sv('m1'), estado: sv('confirmada'), leadId: sv(id), codigo: sv(`EQ-${id}`), llegada: sv(llegada), salida: sv(gt(40)), ...(conChat ? { chat: sv(C) } : {}) });
			return parche('mixto1', `reservas/${id}`, ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('Cliente canceló') });
		};
		await espera('socio cancela su reserva después de recibir el pago (chat «pagada»)', cancelable('rc-pagada', { chatEstado: 'pagada' }), false);
		await espera('socio cancela su reserva cuando el cliente ya llegó', cancelable('rc-llego', { llegada: gt(-1) }), false);
		await espera('socio cancela su reserva el día de llegada', cancelable('rc-hoy', { llegada: gt(0) }), false);
		await espera('socio cancela una reserva de antes, sin su chat guardado', cancelable('rc-vieja', { conChat: false }), false);
		await espera('socio cancela con un chat que no es el de esa solicitud', cancelable('rc-otro-chat', { chatLead: 'otra-solicitud' }), false);
		await espera('socio cancela su reserva antes de que el cliente pague y llegue (control)', cancelable('rc-ok'), true);
		await espera('el administrador cancela una reserva pagada (control)', parche('admin1', 'reservas/rc-pagada', ['estado', 'motivo'], { estado: sv('cancelada'), motivo: sv('Acordado con el cliente') }), true);
	}
	await raw('leads/lead-noche', { nombre: sv('Cliente'), telefono: sv('5555'), propertyId: sv('mx-noche'), propietarioId: sv('m1') });
	await espera('dueña responde una solicitud de su casa por noche (control)', parche('mixto1', 'leads/lead-noche', ['solicitud'], { solicitud: { mapValue: { fields: { estado: sv('confirmada') } } } }), true);
	const CN = 'ChatDeUnaCasaPorNocheLargoYAlAzar123';
	await raw(`chats/${CN}`, { propietarioId: sv('m1'), propertyId: sv('mx-noche'), codigo: sv('EQ-N') });
	await espera('dueña escribe en el chat de su casa por noche (control)', crear('mixto1', `chats/${CN}/mensajes/n1`, m('socio', 'Hola, bienvenidos')), true);
	await espera('dueña lee el chat de su casa por noche (control)', leer('mixto1', `chats/${CN}/mensajes`), true);
	await espera('dueña confirma el chat de su casa por noche (control)', parche('mixto1', `chats/${CN}`, ['estado'], { estado: sv('confirmada') }), true);
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
		const otra = (extra, monto) => crearR('mixto1', 'reservas/lead-res-noche2', delSocio({ leadId: 'lead-res-noche2', codigo: 'EQ-RN2', chat: 'ChatDeLaReservaRN2LargoYAlAzar', ...extra }, { monto }));
		await espera('con 10 precios por fechas: su parte menor que la más barata de las que tocan', otra({ costoSocio: 260, alojamiento: 312, ganancia: 52 }, 52), false);
		await espera('con 10 precios por fechas: su parte con la más barata que toca (control)', otra({ costoSocio: 270, alojamiento: 324, ganancia: 54 }, 54), true);
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
		await espera('otro dueño pone el comprobante', comprobante('socio2', 'r-recibo', url('r-recibo')), false);
		const CA = 'ChatDeUnaCasaQueYaNoEsSuyaLargo12';
		await raw(`chats/${CA}`, { propietarioId: sv('m1'), propertyId: sv('prueba-casa-playa-monterrico'), codigo: sv('EQ-ANT'), estado: sv('confirmada') });
		await espera('el dueño anterior lee los mensajes del chat de una casa que ya no es suya', leer('mixto1', `chats/${CA}/mensajes`), false);
		await espera('el dueño anterior lista sus chats (también el de esa casa)', consulta('mixto1', 'chats', 'propietarioId', 'm1'), true);
	}
	await espera('la dueña quita de su casa las fechas reservadas (al cancelar)', parche('mixto1', 'properties/mx-noche', ['vacacional.reservadas', 'updatedAt'], { vacacional: { mapValue: { fields: { reservadas: { arrayValue: { values: [] } } } } }, updatedAt: { timestampValue: new Date().toISOString() } }), true);
	// El equipo: el asesor no crea ni cambia usuarios
	await espera('asesor crea un usuario', crear('asesor9', 'users/nuevo1', { rol: 'socio', activo: true, propietarioId: 'm1' }), false);
	await espera('asesor desactiva a un dueño', parche('asesor9', 'users/mixto1', ['activo'], { activo: { booleanValue: false } }), false);
	// Una casa por noche no lleva asesor: el asesor no crea una ni pasa la suya a por noche.
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
	const B = 'http://127.0.0.1:9199/v0/b/demo-eq.appspot.com/o';
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
	await espera('storage: un acceso quitado sube una foto', subir('apagado1', 'properties/casa1/foto3.png'), false);
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
console.log(`\n${n - fallas} de ${n} correctos`);
if (fallas) process.exit(1);

