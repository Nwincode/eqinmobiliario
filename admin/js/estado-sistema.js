// Estado del sistema: lo que falló y desde cuándo, armado con lo que ya está guardado. Puro (sin base ni pantalla): lo
// usan la tarjeta de Inicio del administrador (views/dashboard.js) y el correo de cada mañana (netlify/lib/resumen.mjs,
// solo lo que sigue roto después de 24 h). Lo prueba scripts/test-estado.mjs. Lo anota el servidor en estado/{pieza}
// (netlify/lib/estado.mjs): { ok, fallo, falloDesde, motivo }.

const MIN = 60_000, HORA = 60 * MIN, DIA = 24 * HORA;
export const ROTO_CORREO = DIA;

// Los relojes automáticos (netlify/functions con `schedule`) y cuánto pueden tardar antes de avisar.
export const RELOJES = {
	'plazos-reservas': { nombre: 'Plazos de las reservas', tarde: HORA },
	'publicar-pendiente': { nombre: 'Publicación automática', tarde: HORA },
	'comisiones-vencidas': { nombre: 'Comisiones vencidas', tarde: 3 * HORA },
	// Corre cada hora menos de 10 p. m. a 6 a. m. de Guatemala.
	'solicitudes-sin-respuesta': { nombre: 'Control de cada hora', tarde: 12 * HORA },
	'resumen-diario': { nombre: 'Resumen de cada mañana', tarde: 26 * HORA },
	'estado-cuenta': { nombre: 'Estado de cuenta del mes', tarde: 33 * DIA },
	'seo-semanal': { nombre: 'Informe SEO semanal', tarde: 8 * DIA }
};

const ms = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : v?.seconds ? v.seconds * 1000 : typeof v === 'number' ? v : Date.parse(v || '') || 0);
export const rota = (d) => Boolean(d) && ms(d.fallo) > 0 && ms(d.ok) < ms(d.fallo);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Entradas:
//  estados:     { [pieza]: { ok, fallo, falloDesde, motivo } } (la colección estado; `limites` y `respaldo` incluidos)
//  publish:     meta/publish
//  correos:     [{ codigo, desde }]   chats con un correo por reintentar (avisoPendiente)
//  pagos:       [{ desde }]           cambios de datos de pago sin su correo al equipo
//  calendarios: [{ casaId, casa, plataforma, desde }]  Airbnb, Booking o VRBO que no responden
// Devuelve [{ clave, icono, titulo, detalle, desde, href, aviso }]: lo roto primero (lo más viejo arriba) y al final los
// avisos (`aviso`: un tope alcanzado, que no es una falla).
export function armarEstado({ estados = {}, publish = {}, correos = [], pagos = [], calendarios = [], ahora = Date.now() } = {}) {
	const out = [];
	const poner = (x) => out.push({ href: '', aviso: false, detalle: '', ...x });
	const e = (k) => estados[k];
	if (rota(e('correo'))) poner({ clave: 'correo', icono: 'icon-envelope-o', titulo: 'Los correos no están saliendo', detalle: e('correo').motivo, desde: ms(e('correo').falloDesde) || ms(e('correo').fallo) });
	const viejos = correos.filter((c) => ahora - ms(c.desde) > HORA);
	if (viejos.length) poner({ clave: 'correos-chat', icono: 'icon-envelope-o', titulo: `${plural(viejos.length, 'correo de reservas', 'correos de reservas')} por reintentar`, detalle: viejos.slice(0, 3).map((c) => c.codigo).filter(Boolean).join(', '), desde: Math.min(...viejos.map((c) => ms(c.desde))), href: viejos.length === 1 && viejos[0].codigo ? `#/solicitudes/${encodeURIComponent(viejos[0].codigo)}` : '#/solicitudes' });
	const pagosViejos = pagos.filter((p) => ahora - ms(p.desde) > HORA);
	if (pagosViejos.length) poner({ clave: 'aviso-pago', icono: 'icon-money', titulo: `${plural(pagosViejos.length, 'aviso', 'avisos')} de datos de pago sin enviar al equipo`, desde: Math.min(...pagosViejos.map((p) => ms(p.desde))), href: '#/propietarios' });
	if (publish.fallo) {
		const frenada = Boolean(publish.freno);
		poner({ clave: 'publicar', icono: 'icon-exclamation-triangle', titulo: frenada ? 'La publicación del sitio se frenó' : 'La última publicación del sitio falló', detalle: frenada ? publish.freno : 'El sitio anterior sigue en línea', desde: ms(publish.falloCuando) || ms(publish.frenoCuando) || ms(publish.ultimoCambio), href: '#/publicar' });
	}
	for (const c of calendarios) poner({ clave: `ical-${c.casaId}-${c.plataforma}`, icono: 'icon-calendar', titulo: `${c.plataforma} no responde`, detalle: c.casa || c.casaId, desde: ms(c.desde), href: `#/propiedades/${encodeURIComponent(c.casaId)}` });
	if (rota(e('cdn'))) poner({ clave: 'cdn', icono: 'icon-exclamation-triangle', titulo: 'Las fechas de la web tardan en ponerse al día', detalle: e('cdn').motivo, desde: ms(e('cdn').falloDesde) || ms(e('cdn').fallo) });
	// Un rebote a una dirección sin lead vigente (un dueño, el equipo, un cliente de antes: netlify/lib/rebotes.mjs): se ve
	// una semana desde el último; la dirección va en el detalle.
	if (e('rebotes')?.fallo && ahora - ms(e('rebotes').fallo) < 7 * DIA) poner({ clave: 'rebotes', icono: 'icon-envelope-o', titulo: 'Un correo no llegó', detalle: e('rebotes').motivo, desde: ms(e('rebotes').fallo) });
	// Relojes: roto, atrasado o sin correr. Uno sin anotar solo cuenta si el servidor ya anota desde hace más que su plazo
	// (recién publicado esto, ninguno ha corrido todavía).
	const anota = Math.min(...Object.keys(RELOJES).map((k) => ms(e(k)?.ok) || Infinity));
	for (const [k, r] of Object.entries(RELOJES)) {
		const d = e(k);
		const ok = ms(d?.ok);
		if (rota(d)) poner({ clave: `reloj-${k}`, icono: 'icon-clock-o', titulo: `«${r.nombre}» falló`, detalle: d.motivo, desde: ms(d.falloDesde) || ms(d.fallo) });
		else if (ok && ahora - ok > r.tarde) poner({ clave: `reloj-${k}`, icono: 'icon-clock-o', titulo: `«${r.nombre}» no corre`, detalle: 'Revisa las funciones programadas en Netlify', desde: ok });
		else if (!ok && k !== 'estado-cuenta' && k !== 'seo-semanal' && Number.isFinite(anota) && ahora - anota > r.tarde) poner({ clave: `reloj-${k}`, icono: 'icon-clock-o', titulo: `«${r.nombre}» no ha corrido`, detalle: 'Revisa las funciones programadas en Netlify', desde: 0 });
	}
	const resp = e('respaldo');
	if (resp) {
		if (rota(resp)) poner({ clave: 'respaldo', icono: 'icon-hdd-o', titulo: 'El respaldo de la base falló', detalle: resp.motivo, desde: ms(resp.falloDesde) || ms(resp.fallo) });
		else if (ms(resp.ok) && ahora - ms(resp.ok) > 26 * HORA) poner({ clave: 'respaldo', icono: 'icon-hdd-o', titulo: 'El respaldo de la base no ha corrido', desde: ms(resp.ok) });
	}
	// Topes anti-robots de las últimas 24 h: no es una falla, pero si se repite, alguien está abusando (o el tope es corto).
	for (const t of Object.values(e('limites') || {})) {
		if (!t || typeof t !== 'object' || ahora - ms(t.cuando) > DIA) continue;
		poner({ clave: `tope-${t.nombre}`, icono: 'icon-shield', titulo: `Tope anti-robots: «${t.nombre}»`, detalle: t.max ? `${t.max} en ${t.minutos} min` : '', desde: ms(t.cuando), aviso: true });
	}
	return out.sort((a, b) => (a.aviso - b.aviso) || ((a.desde || 0) - (b.desde || 0)));
}

// De lo leído a las entradas de armarEstado (lo mismo en el panel y en el servidor):
// un chat con su correo por reintentar, desde el último intento (o desde que cambió).
export const correosDe = (chats) => chats.filter((c) => String(c.avisoPendiente || '')).map((c) => ({ codigo: c.codigo, desde: ms(c.avisoApartado) || ms(c.updatedAt) || ms(c.createdAt) }));
// Los calendarios que no responden de una casa (privado/icalLeido: `fallo` en cada uno; calendarios = V.CALENDARIOS),
// solo los que la casa todavía tiene (privado/socio con el mismo enlace).
export const calendariosDe = (casa, leido, socio, calendarios) => calendarios.filter((c) => leido?.[c.campo]?.fallo && socio?.[c.campo] && socio[c.campo] === leido[c.campo].url)
	.map((c) => ({ casaId: casa.id, casa: casa.titulo, plataforma: c.nombre, desde: ms(leido[c.campo].fallo) }));

// Lo que va en el correo de cada mañana: lo roto desde hace más de 24 h (sin fecha, también: un reloj que no ha corrido).
export const rotoMasDeUnDia = (lista, ahora = Date.now()) => lista.filter((x) => !x.aviso && (!x.desde || ahora - x.desde > ROTO_CORREO));
