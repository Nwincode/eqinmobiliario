// La solicitud de reserva por el servidor (netlify/functions/solicitud.mjs), con la base, la sesión y el reloj simulados
// (scripts/simulado/): solicitud, chat e índice en una sola transacción; lo que antes revisaban las reglas (cotización,
// fechas, moneda, personas, dueño y asesor de la casa) y lo nuevo (llegada desde hoy con la hora del servidor, Turnstile,
// límite por IP y por correo, reintento sin duplicar).
import './simulado/activar.mjs';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer, hijos } from './simulado/base.mjs';

let ok = 0;
const t = async (nombre, fn) => { limpiar(); delete process.env.TURNSTILE_SITE_KEY; delete process.env.TURNSTILE_SECRET; await fn(); ok++; console.log('✓', nombre); };
const { default: solicitud } = await import('../netlify/functions/solicitud.mjs');
let ip = 0;
const pedir = (cuerpo, { mismaIp = false } = {}) => solicitud({ method: 'POST', headers: new Headers(), json: async () => cuerpo }, { ip: mismaIp ? '10.0.0.1' : `10.1.${Math.floor(++ip / 250)}.${ip % 250}` });
let sec = 0;
const ids = () => { sec++; const leadId = `Lead${String(sec).padStart(16, '0')}`, token = `Token${String(sec).padStart(23, '0')}`; return { leadId, token }; };
const hoy = () => new Date(S.reloj - 6 * 3600000).toISOString().slice(0, 10);
const masDias = (n) => new Date(Date.parse(`${hoy()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const bien = (extra = {}) => ({ codigo: 'EQ-ABC123', llegada: masDias(10), salida: masDias(13), noches: 3, huespedes: 2, subtotal: 400, impuestos: 88, total: 488, deposito: 0, moneda: 'USD', ...extra });
const cuerpo = (r = bien(), lead = {}, extra = {}) => ({ ...ids(), lead: { nombre: 'Ana Morales', telefono: '+502 5555 1234', email: `ana${sec}@example.com`, mensaje: 'EQ-ABC123 · 3 noches', origen: 'reserva', pagina: '/propiedad/casa/',
	propertyId: 'c1', idioma: 'es', ...lead }, reserva: r, chat: { foto: 'https://ejemplo.com/a.jpg', url: '/propiedad/casa/' }, ...extra });
const casa = (extra = {}) => poner('properties/c1', { titulo: 'Casa del lago', operacion: 'vacacional', publicado: true, estado: 'disponible', propietarioId: 'p1', agentId: '', moneda: 'USD', vacacional: { huespedesMax: 4 }, ...extra });
const estado = async (c) => { const r = await pedir(c); return [r.status, await r.json()]; };

await t('solicitud, chat e índice nacen juntos, con el dueño, el asesor y el título de la casa (no los que mande la página)', async () => {
	casa();
	const c = cuerpo(bien(), { propertyTitulo: 'Otro título', agentId: 'a7', propietarioId: 'p9' });
	const [s, d] = await estado(c);
	assert.equal(s, 200, JSON.stringify(d));
	assert.equal(d.token, c.token);
	const lead = leer(`leads/${c.leadId}`), chat = leer(`chats/${c.token}`);
	assert.deepEqual([lead.propietarioId, lead.agentId, lead.propertyTitulo, lead.estado, lead.email], ['p1', '', 'Casa del lago', 'nuevo', `ana${sec}@example.com`]);
	assert.ok(lead.createdAt instanceof Date);
	assert.deepEqual([chat.leadId, chat.codigo, chat.propietarioId, chat.nombre, chat.subtotal, chat.total, chat.huespedes], [c.leadId, 'EQ-ABC123', 'p1', 'Ana', 400, 488, 2]);
	assert.equal(leer(`chatsPorSolicitud/${c.leadId}`).token, c.token);
});

await t('el mismo envío otra vez (la respuesta se perdió) responde lo mismo y no crea otra; con otro chat, 409', async () => {
	casa();
	const c = cuerpo();
	assert.equal((await pedir(c)).status, 200);
	assert.equal((await pedir(c)).status, 200);
	assert.equal(hijos('leads').length, 1);
	assert.equal(hijos('chats').length, 1);
	assert.equal((await pedir({ ...c, token: `Otro${'x'.repeat(24)}` })).status, 409);
});

await t('llegada: hoy sí; ayer no (con la hora del servidor, no la del teléfono)', async () => {
	casa();
	S.reloj = Date.parse('2026-11-25T23:30:00-06:00');
	assert.equal((await pedir(cuerpo(bien({ llegada: '2026-11-25', salida: '2026-11-27', noches: 2 })))).status, 200);
	const [s, d] = await estado(cuerpo(bien({ llegada: '2026-11-24', salida: '2026-11-27', noches: 3 })));
	assert.equal(s, 409);
	assert.equal(d.pasado, true);
	S.reloj = Date.parse('2026-11-20T12:00:00-06:00');
});

await t('lo cotizado: impuestos del 22 %, total = subtotal + impuestos, noches de las fechas, 1 a 90, algo que cobrar', async () => {
	casa();
	const malas = [{ subtotal: 100000 }, { impuestos: 10, total: 410 }, { total: 1 }, { subtotal: 'mucho' }, { subtotal: undefined }, { noches: 1, subtotal: 100, impuestos: 22, total: 122 },
		{ noches: 2.5 }, { subtotal: 0, impuestos: 0, total: 0 }, { subtotal: -100, impuestos: -22, total: -122 }, { llegada: 'mañana' },
		{ llegada: masDias(1), salida: masDias(92), noches: 91, subtotal: 9100, impuestos: 2002, total: 11102 }, { huespedes: 0 }, { moneda: undefined }];
	for (const m of malas) assert.equal((await pedir(cuerpo(bien(m)))).status, 400, JSON.stringify(m));
	for (const m of [{ subtotal: 433.33, impuestos: 95.33, total: 528.66 }, { llegada: masDias(1), salida: masDias(91), noches: 90, subtotal: 9000, impuestos: 1980, total: 10980 }])
		assert.equal((await pedir(cuerpo(bien(m)))).status, 200, JSON.stringify(m));
});

await t('la casa manda: moneda, personas máximo, por noche, publicada y sin pausa por atraso', async () => {
	casa();
	assert.equal((await pedir(cuerpo(bien({ moneda: 'GTQ' })))).status, 409);
	assert.equal((await pedir(cuerpo(bien({ huespedes: 6 })))).status, 409);
	assert.equal((await pedir(cuerpo(bien({ huespedes: 4 })))).status, 200);
	casa({ operacion: 'venta' });
	assert.equal((await pedir(cuerpo())).status, 409);
	casa({ publicado: false });
	assert.equal((await pedir(cuerpo())).status, 409);
	assert.equal((await pedir(cuerpo(bien(), { propertyId: 'no-existe' }))).status, 409);
	casa({ moneda: '' });
	assert.equal((await pedir(cuerpo())).status, 200, 'sin moneda guardada: US$');
	// (Otro socio: la mora se recuerda 5 min por socio en la función.)
	casa({ propietarioId: 'p-mora' });
	poner('reservas/r1', { estado: 'confirmada', propietarioId: 'p-mora', llegada: '2026-11-01', comision: { monto: 50, vence: '2026-11-01', pagada: false }, pagoRecibido: true });
	const [s, d] = await estado(cuerpo());
	assert.equal(s, 409);
	assert.equal(d.pausada, true);
});

await t('correo y teléfono con la regla de formato.js', async () => {
	casa();
	assert.equal((await pedir(cuerpo(bien(), { email: 'no-es-correo' }))).status, 400);
	assert.equal((await pedir(cuerpo(bien(), { email: '' }))).status, 400);
	assert.equal((await pedir(cuerpo(bien(), { telefono: '12' }))).status, 400);
	assert.equal((await pedir({ ...cuerpo(), leadId: 'corto' })).status, 400);
});

await t('límite: 5 por correo y 10 por IP en una hora (lo comparten todas las instancias: en la base)', async () => {
	casa();
	for (let i = 0; i < 5; i++) assert.equal((await pedir(cuerpo(bien(), { email: 'mismo@example.com' }))).status, 200, `envío ${i + 1}`);
	assert.equal((await pedir(cuerpo(bien(), { email: 'mismo@example.com' }))).status, 429);
	for (let i = 0; i < 10; i++) assert.equal((await pedir(cuerpo(bien(), { email: `otro${i}@example.com` }), { mismaIp: true })).status, 200, `envío ${i + 1}`);
	assert.equal((await pedir(cuerpo(bien(), { email: 'otro99@example.com' }), { mismaIp: true })).status, 429);
	assert.ok(hijos('limites').length > 0, 'guardado en la base');
});

await t('Turnstile: sin llaves, la solicitud pasa con el límite; con las dos, una prueba mala no pasa, sin prueba (o con Cloudflare caído) pasa con un límite estricto', async () => {
	casa();
	const real = globalThis.fetch;
	assert.equal((await (await solicitud({ method: 'GET', headers: new Headers() })).json()).turnstile, '');
	assert.equal((await pedir(cuerpo())).status, 200);
	process.env.TURNSTILE_SITE_KEY = '0x4AAAAAAAprueba';
	assert.equal((await (await solicitud({ method: 'GET', headers: new Headers() })).json()).turnstile, '', 'con una sola llave no se pide la prueba');
	process.env.TURNSTILE_SECRET = '0x4AAAAAAAsecreta';
	assert.equal((await (await solicitud({ method: 'GET', headers: new Headers() })).json()).turnstile, '0x4AAAAAAAprueba');
	const vistos = [];
	globalThis.fetch = async (url, op) => { vistos.push(String(op.body)); return Response.json({ success: String(op.body).includes('response=buena') }); };
	try {
		assert.equal((await pedir(cuerpo(bien(), {}, { turnstile: 'mala' }))).status, 403, 'una respuesta rechazada por Cloudflare no pasa');
		assert.equal((await pedir(cuerpo(bien(), {}, { turnstile: 'buena' }))).status, 200);
		assert.ok(vistos.every((b) => b.includes('secret=0x4AAAAAAAsecreta')));
		// Sin prueba (el navegador no la pudo cargar o hacer): sigue, con un límite más estricto (3 por IP en una hora).
		for (let i = 0; i < 3; i++) assert.equal((await pedir(cuerpo(), { mismaIp: true })).status, 200, `sin prueba ${i + 1}`);
		assert.equal((await pedir(cuerpo(), { mismaIp: true })).status, 429);
		assert.equal((await pedir(cuerpo(bien(), {}, { turnstile: 'buena' }), { mismaIp: true })).status, 200, 'con la prueba, el límite normal');
		// Cloudflare no responde: no pasa «cualquier respuesta»; cuenta como sin prueba (límite estricto).
		globalThis.fetch = async () => { throw new Error('sin red'); };
		assert.equal((await pedir(cuerpo(bien(), {}, { turnstile: 'cualquiera' }), { mismaIp: true })).status, 429, 'con la IP ya en su tope estricto');
		assert.equal((await pedir(cuerpo(bien(), {}, { turnstile: 'cualquiera' }))).status, 200, 'otra IP: pasa con el límite estricto');
	} finally { globalThis.fetch = real; }
});

await t('reintento (la respuesta se perdió): se reconoce antes de revisar las fechas (pasó la medianoche) y de los límites; responde el mismo token', async () => {
	casa();
	S.reloj = Date.parse('2026-11-25T23:59:50-06:00');
	const c = cuerpo(bien({ llegada: '2026-11-25', salida: '2026-11-27', noches: 2 }));
	assert.equal((await pedir(c)).status, 200);
	S.reloj = Date.parse('2026-11-26T00:00:20-06:00');
	const r = await pedir({ ...c, reserva: { ...c.reserva, codigo: 'EQ-OTRO99' } });
	assert.equal(r.status, 200);
	assert.equal((await r.json()).token, c.token);
	assert.equal(leer(`chats/${c.token}`).codigo, 'EQ-ABC123');
	S.reloj = Date.parse('2026-11-20T12:00:00-06:00');
});

await t('el chat nace con su aviso pendiente (si la página no llama /api/aviso-chat, lo manda el control de cada hora); el nombre con contacto no llega al socio', async () => {
	casa();
	const c = cuerpo(bien(), { nombre: '55551234 Ana' });
	assert.equal((await pedir(c)).status, 200);
	assert.equal(leer(`chats/${c.token}`).avisoPendiente, 'nueva');
	assert.equal(leer(`chats/${c.token}`).nombre, 'Cliente');
	assert.equal(leer(`leads/${c.leadId}`).nombre, '55551234 Ana', 'la solicitud (la ve el equipo) lo guarda completo');
});

await t('los motivos que lee el cliente vienen en su idioma', async () => {
	casa({ publicado: false });
	assert.match((await (await pedir(cuerpo(bien(), { idioma: 'en' }))).json()).error, /no longer takes bookings/);
	assert.match((await (await pedir(cuerpo())).json()).error, /ya no recibe reservas/);
});

await t('sin prueba: el sitio entero tiene un tope (20 por hora); pasado, se pide la prueba. Solo cuenta lo que se guardó', async () => {
	casa();
	process.env.TURNSTILE_SITE_KEY = 'pk'; process.env.TURNSTILE_SECRET = 'sk';
	let guardadas = 0;
	for (let i = 0; i < 30; i++) if ((await pedir(cuerpo())).status === 200) guardadas++;
	assert.equal(guardadas, 20);
	const r = await pedir(cuerpo());
	assert.equal(r.status, 403);
	assert.equal((await r.json()).turnstile, true);
	limpiar(); casa();
	// Un intento que no se guarda (la casa no recibe) no gasta el tope estricto de su IP.
	casa({ publicado: false });
	for (let i = 0; i < 5; i++) assert.equal((await pedir(cuerpo(), { mismaIp: true })).status, 409);
	casa();
	assert.equal((await pedir(cuerpo(), { mismaIp: true })).status, 200);
});

await t('reintento con el nombre o el teléfono corregidos: la misma solicitud se pone al día (no otra); la página puede preguntar si ya quedó', async () => {
	casa();
	const c = cuerpo();
	assert.equal((await pedir(c)).status, 200);
	assert.equal((await pedir({ ...c, lead: { ...c.lead, nombre: 'Ana María Morales', telefono: '+502 5555 9999' } })).status, 200);
	assert.equal(hijos('leads').length, 1);
	assert.deepEqual([leer(`leads/${c.leadId}`).nombre, leer(`leads/${c.leadId}`).telefono], ['Ana María Morales', '+502 5555 9999']);
	const consulta = async (leadId, token) => (await (await pedir({ consulta: true, leadId, token })).json()).guardada;
	assert.equal(await consulta(c.leadId, c.token), true);
	assert.equal(await consulta(`${'Z'.repeat(20)}`, c.token), false);
});

await t('reintento con la base sin responder: 503 (no «la llegada ya pasó» ni otra solicitud)', async () => {
	casa();
	S.reloj = Date.parse('2026-11-25T23:59:50-06:00');
	const c = cuerpo(bien({ llegada: '2026-11-25', salida: '2026-11-27', noches: 2 }));
	assert.equal((await pedir(c)).status, 200);
	S.reloj = Date.parse('2026-11-26T00:00:20-06:00');
	S.lecturaFalla = true;
	try { assert.equal((await pedir(c)).status, 503); } finally { S.lecturaFalla = false; S.reloj = Date.parse('2026-11-20T12:00:00-06:00'); }
});

await t('reintento ya atendido o de hace más de 30 min: el enlace no cambia el contacto', async () => {
	casa();
	const c = cuerpo();
	assert.equal((await pedir(c)).status, 200);
	poner(`leads/${c.leadId}`, { ...leer(`leads/${c.leadId}`), solicitud: { estado: 'confirmada' } });
	assert.equal((await pedir({ ...c, lead: { ...c.lead, nombre: 'Otro Nombre' } })).status, 200);
	assert.equal(leer(`leads/${c.leadId}`).nombre, 'Ana Morales');
	const d = cuerpo();
	assert.equal((await pedir(d)).status, 200);
	S.reloj += 31 * 60_000;
	try { assert.equal((await pedir({ ...d, lead: { ...d.lead, nombre: 'Otro Nombre' } })).status, 200); } finally { S.reloj = Date.parse('2026-11-20T12:00:00-06:00'); }
	assert.equal(leer(`leads/${d.leadId}`).nombre, 'Ana Morales');
});

await t('fechas tomadas: con una reserva confirmada, un bloqueo del socio u otra solicitud que las aparta, 409 y no se guarda; las de al lado sí', async () => {
	casa({ vacacional: { huespedesMax: 4, reservadas: [{ desde: masDias(11), hasta: masDias(12) }] } });
	let [s, d] = await estado(cuerpo());
	assert.deepEqual([s, d.fechas], [409, true], JSON.stringify(d));
	casa({ vacacional: { huespedesMax: 4, bloqueos: [{ desde: masDias(12), hasta: masDias(20) }] } });
	assert.equal((await pedir(cuerpo())).status, 409);
	casa();
	const primera = cuerpo();
	assert.equal((await pedir(primera)).status, 200);
	poner(`montosSolicitud/${primera.leadId}`, { alojamiento: 400, delPlan: 400, coincide: true });
	[s, d] = await estado(cuerpo(bien(), { idioma: 'en' }));
	assert.deepEqual([s, d.error], [409, 'Those dates are no longer available: pick others on the calendar.']);
	assert.equal((await pedir(cuerpo(bien({ llegada: masDias(13), salida: masDias(16) })))).status, 200);
	assert.equal(hijos('leads').length, 2);
});

await t('reintento que no es la misma (otro correo, casa, fechas o personas): no cambia el contacto, se trata como nueva (409)', async () => {
	casa(); poner('properties/c2', { ...leer('properties/c1'), titulo: 'Otra' });
	const c = cuerpo();
	assert.equal((await pedir(c)).status, 200);
	for (const cambio of [{ lead: { ...c.lead, email: 'otro@example.com' } }, { lead: { ...c.lead, propertyId: 'c2' } }, { reserva: bien({ llegada: masDias(20), salida: masDias(23) }) }, { reserva: bien({ huespedes: 3 }) }]) {
		const r = await pedir({ ...c, ...cambio, lead: { ...(cambio.lead || c.lead), nombre: 'Intruso X', telefono: '+502 4444 9999' } });
		assert.equal(r.status, 409, JSON.stringify(cambio));
	}
	assert.deepEqual([leer(`leads/${c.leadId}`).nombre, leer(`leads/${c.leadId}`).telefono, hijos('leads').length], ['Ana Morales', '+502 5555 1234', 1]);
	// El reintento verdadero pasa por su propio límite por IP (30 por hora), no por el de las solicitudes nuevas.
	let rechazados = 0;
	for (let i = 0; i < 32; i++) if ((await pedir({ ...c, lead: { ...c.lead, nombre: `Ana ${i}` } }, { mismaIp: true })).status === 429) rechazados++;
	assert.ok(rechazados >= 2, String(rechazados));
});

await t('la pregunta «¿ya quedó?», el reintento de la misma y un choque (503) no gastan el cupo de IP ni el de correo: solo lo guardado cuenta', async () => {
	casa();
	const c = cuerpo();
	// Cinco intentos que no se guardan (la base falla) y diez preguntas desde la misma IP.
	S.escrituraFalla = true;
	try { for (let i = 0; i < 5; i++) assert.equal((await pedir(c, { mismaIp: true })).status, 500); } finally { S.escrituraFalla = false; }
	for (let i = 0; i < 10; i++) assert.equal((await pedir({ consulta: true, leadId: c.leadId, token: c.token }, { mismaIp: true })).status, 200);
	assert.equal((await pedir(c, { mismaIp: true })).status, 200);
	assert.equal((await pedir(c, { mismaIp: true })).status, 200);
	// Y lo guardado sí: diez por IP en una hora, la undécima 429.
	limpiar(); casa();
	let ok = 0;
	for (let i = 0; i < 11; i++) if ((await pedir(cuerpo(bien({ llegada: masDias(20 + 3 * i), salida: masDias(23 + 3 * i) })), { mismaIp: true })).status === 200) ok++;
	assert.equal(ok, 10);
	// La página de antes (en caché) pregunta por GET ?lead=&token=: responde igual.
	const g = await solicitud({ method: 'GET', url: `https://x/api/solicitud?lead=${c.leadId}&token=${c.token}`, headers: new Headers() }, { ip: '10.9.9.9' });
	assert.deepEqual(await g.json(), { guardada: false });
});

await t('montos congelados al guardar: la solicitud aparta sus fechas al instante (la siguiente sobre ellas, 409); por debajo del plan, le toca al equipo', async () => {
	casa({ vacacional: { huespedesMax: 4 } });
	poner('properties/c1/privado/socio', { margen: 20, precioBase: 100, precioFinde: 100 });
	const c = cuerpo(bien({ subtotal: 400, impuestos: 88, total: 488 }));
	assert.equal((await pedir(c)).status, 200);
	const m = leer(`montosSolicitud/${c.leadId}`);
	assert.ok(m && m.alojamiento > 0, JSON.stringify(m));
	assert.equal(leer('apartadasCasa/c1').lista.length, 1);
	const [s2, d2] = await estado(cuerpo(bien({ llegada: masDias(11), salida: masDias(12), noches: 1, subtotal: 200, impuestos: 44, total: 244 })));
	assert.deepEqual([s2, d2.fechas], [409, true]);
	const barata = cuerpo(bien({ llegada: masDias(30), salida: masDias(33), subtotal: 10, impuestos: 2.2, total: 12.2 }));
	assert.equal((await pedir(barata)).status, 200);
	assert.deepEqual([leer(`chats/${barata.token}`).confirmaEquipo, leer(`chats/${barata.token}`).teTocaPendiente], [true, true]);
});

await t('freno previo por IP: 60 solicitudes distintas por hora aunque ninguna se guarde (casa que no existe), con o sin prueba; repetir la misma no suma a la IP pero tiene 5 reintentos; el GET con basura no cuenta', async () => {
	// La misma solicitud otra vez no suma a la IP, pero tiene sus propios reintentos (5 por hora): reusar un id no salta el freno.
	const misma = cuerpo(bien(), { propertyId: 'no-existe-x' });
	const reintentos = [];
	for (let i = 0; i < 8; i++) reintentos.push((await pedir(misma, { mismaIp: true })).status);
	assert.deepEqual(reintentos, [409, 409, 409, 409, 409, 409, 429, 429]);
	const st = [];
	for (let i = 0; i < 61; i++) st.push((await pedir(cuerpo(bien(), { propertyId: `no-existe-${i}` }), { mismaIp: true })).status);
	assert.deepEqual([st.slice(0, 59).every((x) => x === 409), st.slice(59)], [true, [429, 429]], st.join(','));
	const g = await solicitud({ method: 'GET', url: 'https://x/api/solicitud?lead=basura&token=x', headers: new Headers() }, { ip: '10.7.7.7' });
	assert.deepEqual(await g.json(), { guardada: false });
	assert.ok(hijos('limites').every((d) => d.vence instanceof Date));
});

console.log(`${ok} pruebas de la solicitud por el servidor pasan.`);
