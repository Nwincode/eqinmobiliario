// Pruebas del estado de cuenta del socio (admin/js/estado-cuenta.js, netlify/lib/estado-cuenta.mjs, el envío del día 1
// netlify/functions/estado-cuenta.mjs y el envío a mano netlify/functions/estado-cuenta-panel.mjs): lo que debe hoy (solo
// lo cobrable: V.cobrable, con los datos del chat como la pausa y el corte), lo vencido, el mes por moneda (las cuentas de
// Rentas: V.resumenReservas), lo de meses anteriores, que no se repita, que lo que no salió salga en la siguiente vuelta y
// que el envío a mano sea solo del administrador y no toque el automático. Base y correo simulados.
import './simulado/activar.mjs';
import '../js/calc-vacacional.js';
import assert from 'node:assert/strict';
import { S, limpiar, poner, leer } from './simulado/base.mjs';

const V = globalThis.EQVacacional;
const { estadoDeCuenta, mesAnterior, estadoComision, hayQueMandar } = await import('../admin/js/estado-cuenta.js');
const { mandarEstadosDeCuenta } = await import('../netlify/functions/estado-cuenta.mjs');
const { reservasDeSocio } = await import('../netlify/lib/estado-cuenta.mjs');
const { default: panel } = await import('../netlify/functions/estado-cuenta-panel.mjs');

let n = 0;
const t = async (nombre, fn) => { limpiar(); await fn(); n++; console.log('✓', nombre); };
// El día 1 de noviembre, 7:40 a. m. de Guatemala: se manda octubre.
const DIA1 = Date.parse('2026-11-01T07:40:00-06:00');
const CHAT = (x) => `chat${x}`.padEnd(24, '0');
// Una reserva confirmada con su comisión como la deja comisionDeReserva (monto, vence = llegada, pagada).
const res = (id, o) => {
	const r = { id, propietarioId: 'p1', estado: 'confirmada', propertyTitulo: 'Casa Lago', codigo: `EQ-${id}`, costoSocio: 100, alojamiento: 130, moneda: 'USD', chat: CHAT(id), ...o };
	r.comision = { monto: 30, vence: r.llegada, pagada: false, ...o.comision };
	return r;
};
// Los seis casos de la simulación, más uno en quetzales.
const ESCENARIOS = {
	pagada: res('a', { llegada: '2026-10-05', salida: '2026-10-07', pagoRecibido: true, comision: { monto: 20, pagada: true } }),
	clientePago: res('b', { llegada: '2026-10-10', salida: '2026-10-13', pagoRecibido: true }),
	sinPrueba31: res('c', { llegada: '2026-10-31', salida: '2026-11-02', comision: { monto: 40 } }),
	septiembre: res('d', { llegada: '2026-09-12', salida: '2026-09-14', comision: { monto: 25 }, chat: undefined }),
	diciembre: res('e', { llegada: '2026-12-20', salida: '2026-12-23', pagoRecibido: true, comision: { monto: 50 } }),
	noLlego: res('f', { llegada: '2026-10-18', salida: '2026-10-20', estado: 'cancelada', motivo: 'No me llegó el pago' }),
	quetzales: res('g', { llegada: '2026-10-22', salida: '2026-10-24', moneda: 'GTQ', costoSocio: 800, chat: undefined, comision: { monto: 160 } })
};
const TODAS = Object.values(ESCENARIOS);
const cargar = (lista = TODAS) => {
	for (const r of lista) poner(`reservas/${r.id}`, r);
	// El chat de la del 31: sigue confirmada, sin comprobante del cliente.
	poner(`chats/${CHAT('c')}`, { estado: 'confirmada' });
};

await t('el mes anterior, también en enero', () => {
	assert.equal(mesAnterior('2026-11-01'), '2026-10');
	assert.equal(mesAnterior('2027-01-01'), '2026-12');
});

await t('los seis casos: por pagar solo lo cobrable, vencido, el mes y lo de septiembre', async () => {
	cargar();
	const c = estadoDeCuenta(await reservasDeSocio('p1', DIA1), 'p1', '2026-10', DIA1);
	// Por pagar: b (30) + d (25) + e (50, el cliente ya pagó la de diciembre) en US$; g (160) en Q. Nunca se suman.
	assert.deepEqual(c.porPagar, { USD: 105, GTQ: 160 });
	// Vencido: b y d (y g); la de diciembre aún no vence.
	assert.deepEqual(c.vencido, { USD: 55, GTQ: 160 });
	// El mes: a, b, c, g (sin la cancelada ni la de diciembre).
	assert.deepEqual(c.reservas.map((x) => x.reserva.id), ['a', 'b', 'g', 'c']);
	assert.deepEqual(c.reservas.map((x) => x.estado), ['pagada', 'vencida', 'vencida', 'por confirmar pago']);
	assert.equal(c.total, 4);
	assert.equal(c.noches, 2 + 3 + 2 + 2);
	const rentas = V.resumenReservas(TODAS.filter((r) => r.llegada.startsWith('2026-10')));
	assert.deepEqual(c.tuParte, { USD: rentas.porMoneda.USD.costoSocio, GTQ: rentas.porMoneda.GTQ.costoSocio });
	assert.deepEqual(c.comision, { USD: 90, GTQ: 160 });
	assert.deepEqual(c.pagada, { USD: 20 });
	assert.deepEqual(c.anteriores.map((x) => [x.reserva.id, x.estado]), [['d', 'vencida']]);
});

await t('la del 31 sin prueba: «por confirmar pago» hasta que pasan los 3 días; con comprobante en el chat, vencida', async () => {
	cargar();
	const c = ESCENARIOS.sinPrueba31;
	assert.equal(estadoComision(c, DIA1), 'por confirmar pago');
	const dia4 = Date.parse('2026-11-04T07:40:00-06:00');
	assert.equal(estadoComision(c, dia4), 'vencida', 'ya no puede decir «No me llegó»');
	poner(`chats/${CHAT('c')}`, { estado: 'confirmada', comprobanteCliente: DIA1 - 3600_000 });
	const cuenta = estadoDeCuenta(await reservasDeSocio('p1', DIA1), 'p1', '2026-10', DIA1);
	assert.equal(cuenta.reservas.find((x) => x.reserva.id === 'c').estado, 'vencida');
	assert.equal(cuenta.porPagar.USD, 145);
});

await t('la de diciembre: con «Pago recibido» cuenta en por pagar (no vencida); con el comprobante solo en el chat, aún no', async () => {
	const conPago = estadoDeCuenta([ESCENARIOS.diciembre], 'p1', '2026-10', DIA1);
	assert.deepEqual(conPago.porPagar, { USD: 50 });
	assert.deepEqual(conPago.vencido, {});
	assert.deepEqual(conPago.reservas, []);
	assert.equal(estadoComision(ESCENARIOS.diciembre, DIA1), 'vence 20 dic');
	// El chat no se lee hasta que vence (V.faltaLeerChat): lo mismo que la pausa y el corte de permisos.
	const soloChat = { ...ESCENARIOS.diciembre, pagoRecibido: false };
	poner('reservas/e', soloChat);
	poner(`chats/${CHAT('e')}`, { estado: 'confirmada', comprobanteCliente: DIA1 });
	assert.deepEqual(estadoDeCuenta(await reservasDeSocio('p1', DIA1), 'p1', '2026-10', DIA1).porPagar, {});
});

await t('al día y sin reservas: no se manda; con solo una deuda vieja, sí', () => {
	const nada = estadoDeCuenta([ESCENARIOS.pagada], 'p1', '2026-09', DIA1);
	assert.equal(hayQueMandar(nada), false);
	assert.equal(hayQueMandar(estadoDeCuenta([ESCENARIOS.septiembre], 'p1', '2026-10', DIA1)), true);
});

await t('el día 1: un correo por socio con reservas o con deuda; el que no debe nada ni tuvo reservas, no; no se repite', async () => {
	S.reloj = DIA1;
	cargar();
	poner('reservas/v1', res('v1', { propietarioId: 'p2', llegada: '2026-08-02', salida: '2026-08-04', chat: undefined, comision: { monto: 70 } }));
	poner('reservas/v2', res('v2', { propietarioId: 'p3', llegada: '2026-10-02', salida: '2026-10-04', comision: { monto: 10, pagada: true } }));
	poner('propietarios/p1', { nombre: 'Ana López', email: 'ana@correo.com' });
	poner('propietarios/p2', { nombre: 'Luis', email: 'luis@correo.com' });
	poner('propietarios/p3', { nombre: 'Marta', email: 'marta@correo.com' });
	poner('propietarios/p4', { nombre: 'Sin nada', email: 'x@correo.com' });
	assert.equal(await mandarEstadosDeCuenta(S.reloj), 3);
	assert.deepEqual(S.salida.map((m) => m.para).sort(), ['ana@correo.com', 'luis@correo.com', 'marta@correo.com']);
	const ana = S.salida.find((m) => m.para === 'ana@correo.com').texto;
	assert.match(ana, /^Tu estado de cuenta de octubre de 2026\n\nHola Ana, esto es lo que llevas con EQ\./);
	assert.match(ana, /Por pagar a EQ: US\$ 105\.00 · Q 160\.00/);
	assert.match(ana, /Ya vencido: US\$ 55\.00 · Q 160\.00/);
	assert.match(ana, /Subir comprobante: https:\/\/eqinmobiliario\.gt\/admin\/#\/solicitudes/);
	assert.match(ana, /\nOctubre\nReservas: 4 · 9 noches\nTu parte: US\$ 300\.00 · Q 800\.00\nGanancia de EQ: US\$ 90\.00 · Q 160\.00\nYa pagaste: US\$ 20\.00\n/);
	assert.match(ana, /Casa Lago · 5 – 7 oct: US\$ 20\.00 · pagada/);
	// En un celular no cabe la casa junto a «por confirmar pago»: quedan las fechas y el monto.
	assert.match(ana, /\n31 oct – 2 nov: US\$ 40\.00 · por confirmar pago/);
	assert.match(ana, /Casa Lago · 22 – 24 oct: Q 160\.00 · vencida/);
	assert.match(ana, /De meses anteriores\nCasa Lago · 12 – 14 sept: US\$ 25\.00 · vencida/);
	assert.doesNotMatch(ana, /20 – 23 dic|18 – 20 oct/, 'ni la de diciembre ni la cancelada en las filas');
	const luis = S.salida.find((m) => m.para === 'luis@correo.com').texto;
	assert.match(luis, /Por pagar a EQ: US\$ 70\.00/);
	assert.doesNotMatch(luis, /\nOctubre\n|Reservas:/, 'sin reservas en el mes, sin el bloque del mes');
	assert.match(luis, /De meses anteriores\nCasa Lago · 2 – 4 ago: US\$ 70\.00 · vencida/);
	const marta = S.salida.find((m) => m.para === 'marta@correo.com').texto;
	assert.match(marta, /Por pagar a EQ: Nada\nYa vencido: Nada: estás al día/);
	assert.match(marta, /Abrir mi panel: https:\/\/eqinmobiliario\.gt\/admin\//);
	assert.doesNotMatch(marta, /Ya pagaste: US\$ 0|De meses anteriores/);
	assert.equal(leer('estadosCuenta/p1_2026-10').enviado, true);
	assert.equal(await mandarEstadosDeCuenta(S.reloj + 86_400_000), 0);
	assert.equal(S.salida.length, 3);
});

await t('si el correo falla, queda suelto y sale en la vuelta del día 2', async () => {
	S.reloj = DIA1;
	poner('propietarios/p1', { nombre: 'Ana', email: 'ana@correo.com' });
	poner('reservas/a', ESCENARIOS.pagada);
	S.correoFalla = true;
	assert.equal(await mandarEstadosDeCuenta(S.reloj), 0);
	assert.equal(leer('estadosCuenta/p1_2026-10').enviado, false);
	S.correoFalla = false;
	assert.equal(await mandarEstadosDeCuenta(S.reloj + 86_400_000), 1);
});

// ---------------------------------------------------------------- A mano, desde el panel
const pedir = (cuerpo) => panel(new Request('https://eqinmobiliario.gt/api/estado-cuenta', { method: 'POST', body: JSON.stringify(cuerpo) }));
const ADMIN = { uid: 'u-admin', nombre: 'Admin', admin: true };

await t('a mano: solo el administrador; ni el asesor ni un socio', async () => {
	cargar();
	poner('propietarios/p1', { nombre: 'Ana', email: 'ana@correo.com' });
	const cuerpo = { accion: 'vista', propietarioId: 'p1', mes: '2026-10' };
	assert.equal((await pedir(cuerpo)).status, 403, 'sin sesión');
	S.staff = { uid: 'u-asesor', nombre: 'Asesor', admin: false };
	assert.equal((await pedir(cuerpo)).status, 403, 'asesor');
	S.staff = null; S.socio = { uid: 'u-socio', propietarioId: 'p1' };
	assert.equal((await pedir(cuerpo)).status, 403, 'socio');
	S.socio = null; S.staff = ADMIN;
	const r = await pedir(cuerpo);
	assert.equal(r.status, 200);
	const v = await r.json();
	assert.equal(v.para, 'ana@correo.com');
	assert.match(v.asunto, /Tu estado de cuenta de octubre de 2026/);
	assert.equal(S.salida.length, 0, 'la vista no manda nada');
});

await t('a mano: mes inválido o futuro, socio que no existe o sin correo, acción desconocida', async () => {
	S.staff = ADMIN;
	poner('propietarios/p1', { nombre: 'Ana', email: 'ana@correo.com' });
	poner('propietarios/p9', { nombre: 'Sin correo', email: 'no-es-correo' });
	for (const mes of ['2026-13', '26-10', '', '2099-01']) assert.equal((await pedir({ accion: 'vista', propietarioId: 'p1', mes })).status, 400, mes);
	assert.equal((await pedir({ accion: 'vista', propietarioId: '../x', mes: '2026-10' })).status, 400);
	assert.equal((await pedir({ accion: 'borrar', propietarioId: 'p1', mes: '2026-10' })).status, 400);
	assert.equal((await pedir({ accion: 'vista', propietarioId: 'p8', mes: '2026-10' })).status, 404);
	const sin = await pedir({ accion: 'enviar', propietarioId: 'p9', mes: '2026-10' });
	assert.equal(sin.status, 422);
	assert.match((await sin.json()).error, /correo válido/);
	assert.equal(S.salida.length, 0);
});

await t('a mano: lo manda con los mismos números del día 1, lo anota y no toca el envío automático', async () => {
	S.reloj = DIA1;
	cargar();
	poner('propietarios/p1', { nombre: 'Ana López', email: 'ana@correo.com' });
	S.staff = ADMIN;
	const r = await pedir({ accion: 'enviar', propietarioId: 'p1', mes: '2026-10' });
	assert.equal(r.status, 200);
	assert.equal(S.salida.length, 1);
	const manual = S.salida[0].texto;
	const doc = leer('estadosCuenta/p1_2026-10');
	assert.equal(doc.enviado, undefined, 'no marca el del día 1');
	assert.equal(doc.manual.length, 1);
	assert.equal(doc.manual[0].quien, 'u-admin');
	// El del día 1 sale igual, con el mismo texto.
	assert.equal(await mandarEstadosDeCuenta(DIA1), 1);
	assert.equal(S.salida[1].texto, manual);
	assert.equal(leer('estadosCuenta/p1_2026-10').enviado, true);
	assert.equal(leer('estadosCuenta/p1_2026-10').manual.length, 1, 'el rastro queda');
	assert.equal((await pedir({ accion: 'enviar', propietarioId: 'p1', mes: '2026-10' })).status, 200);
	assert.equal(leer('estadosCuenta/p1_2026-10').manual.length, 2);
	assert.equal(leer('estadosCuenta/p1_2026-10').enviado, true);
});

console.log(`${n} pruebas del estado de cuenta pasan.`);
