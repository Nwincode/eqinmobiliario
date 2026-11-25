// Avisos de la campana (admin/js/avisos.js): lo que espera a alguien, armado con lo que ya está guardado. Puro (sin
// base ni pantalla): lo prueba scripts/test-avisos.mjs. Cada aviso se va solo cuando se resuelve donde lleva su enlace
// (se responde, se confirma, se paga, se renueva). Los que no tienen cómo resolverse solos (un dueño pidió cambios,
// «No se dio» con fechas ocupadas, una exclusiva, una foto que el equipo deja oculta) llevan «Listo»: queda en avisosAtendidos/{clave} (firestore.rules).

// Pedidos de cambio de los dueños: los de los últimos 30 días (los de antes ya no se cuentan como «por atender»).
export const DIAS_COMENTARIO = 30;
// Exclusivas: desde 30 días antes de vencer hasta 30 días después.
export const DIAS_EXCLUSIVA = 30;
const DIA = 86400000;
const enVentana = (dias) => typeof dias === 'number' && dias <= DIAS_EXCLUSIVA && dias >= -DIAS_EXCLUSIVA;

// «hace 5 min», «hace 3 h», «hace 2 d».
export function hace(desde, ahora = Date.now()) {
	const min = Math.max(1, Math.round((ahora - desde) / 60000));
	return min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} d`;
}

// La clave de un «Listo»: la misma que exigen las reglas (tipo, el registro y, en la exclusiva, su fecha de fin; con
// otra fecha de fin, la exclusiva renovada vuelve a avisar).
export const claveListo = ({ tipo, objeto, fin }) => (tipo === 'exclusiva' ? `${tipo}_${objeto}_${fin}` : `${tipo}_${objeto}`);

const recorta = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const enlaceSolicitud = (codigo) => `#/solicitudes/${encodeURIComponent(codigo)}`;

function textoExclusiva(dias) {
	if (dias > 1) return `La exclusiva vence en ${dias} días`;
	if (dias === 1) return 'La exclusiva vence mañana';
	if (dias === 0) return 'La exclusiva vence hoy';
	return dias === -1 ? 'La exclusiva venció ayer' : `La exclusiva venció hace ${-dias} días`;
}

// Entradas (cada lista ya trae solo lo que esa persona puede ver):
//  solicitudes: [{ leadId, codigo, nombre, casa, creado, estado, alerta, equipo }]   alerta: '' | 'tarde' | 'mora' | 'bloqueada'; equipo: la confirma el administrador
//  mensajes:    [{ codigo, nombre, casa, fecha }]                           chats cuyo último mensaje es del cliente
//  fotos:       [{ leadId, codigo, nombre, casa, mensaje, fecha, marca, n }] fotos del cliente ocultas al socio (la más nueva)
//  comprobantes:[{ codigo, socio, casa, fecha }]                            pago a EQ subido, sin marcar pagado
//  comisiones:  [{ codigo, casa, nivel, vence }]                            del socio: su pago a EQ vencido, sin comprobante
//  comentarios: [{ id, propietarioId, dueno, casa, texto, fecha, agentId }] tipo «cambios»
//  exclusivas:  [{ casaId, casa, dueno, fin, dias, agentId }]
//  leads:       [{ id, nombre, casa, creado }]                              de la web, sin atender (estado «nuevo»)
//  atendidos:   Set de claves con «Listo».
// Devuelve [{ clave, tipo, icono, titulo, detalle, fecha, href, urgente, listo }], lo urgente primero y después lo más nuevo.
export function armarAvisos({ solicitudes = [], mensajes = [], fotos = [], comprobantes = [], comisiones = [], comentarios = [], exclusivas = [], leads = [], cambiosDueno = [], atendidos = new Set(), ahora = Date.now() } = {}) {
	const out = [];
	const conMensaje = new Set(mensajes.map((m) => m.codigo));
	const conSolicitud = new Set();
	for (const s of solicitudes) {
		if (s.estado === 'pendiente') {
			conSolicitud.add(s.codigo);
			out.push({
				// Cotizada por debajo del precio de la casa (s.equipo): el socio no la confirma, le toca al administrador.
				clave: `solicitud_${s.codigo}`, tipo: 'solicitud', icono: 'icon-calendar', href: enlaceSolicitud(s.codigo), fecha: s.creado, urgente: s.alerta === 'tarde' || Boolean(s.equipo),
				titulo: s.equipo ? `Te toca confirmar la solicitud de ${s.nombre || 'un cliente'}` : `${s.nombre || 'Un cliente'} pide reservar`,
				detalle: [s.casa, s.equipo ? 'se le cotizó menos que el precio de la casa' : '', s.alerta === 'tarde' ? 'sin responder' : '', conMensaje.has(s.codigo) ? 'te escribió' : ''].filter(Boolean).join(' · ')
			});
		}
		if (s.alerta === 'mora') out.push({
			clave: `mora_${s.codigo}`, tipo: 'mora', icono: 'icon-money', href: enlaceSolicitud(s.codigo), fecha: s.creado, urgente: true,
			titulo: 'Ganancia de EQ con más de 72 h de atraso', detalle: [s.codigo, s.casa].filter(Boolean).join(' · ')
		});
		if (s.alerta === 'bloqueada' && s.leadId) {
			const listo = { tipo: 'robo', objeto: s.leadId, agentId: '' };
			const clave = claveListo(listo);
			if (!atendidos.has(clave)) out.push({
				clave, tipo: 'robo', icono: 'icon-exclamation-triangle', href: enlaceSolicitud(s.codigo), fecha: s.creado, urgente: true, listo,
				titulo: '«No se dio», pero se bloquearon esas fechas', detalle: [s.codigo, s.casa].filter(Boolean).join(' · ')
			});
		}
	}
	// Un mensaje de una solicitud sin responder va en el aviso de la solicitud (un solo aviso por reserva).
	for (const m of mensajes) if (!conSolicitud.has(m.codigo)) out.push({
		clave: `mensaje_${m.codigo}`, tipo: 'mensaje', icono: 'icon-commenting-o', href: enlaceSolicitud(m.codigo), fecha: m.fecha, urgente: false,
		titulo: `${m.nombre || 'El cliente'} te escribió`, detalle: [m.codigo, m.casa].filter(Boolean).join(' · ')
	});
	// Una foto del cliente que el socio no ve (la revisión la ocultó o ya no se revisa): el equipo la mira en el chat y decide
	// («Mostrar al socio» la quita). Si decide dejarla oculta, «Listo» (la clave lleva la foto: otra nueva vuelve a avisar).
	for (const f of fotos) {
		const listo = { tipo: 'foto', objeto: `${f.leadId}_${f.mensaje}`, agentId: '' };
		const clave = claveListo(listo);
		if (atendidos.has(clave)) continue;
		out.push({
			clave, tipo: 'foto', icono: 'icon-eye-slash', href: `#/mensajes/${encodeURIComponent(f.codigo)}`, fecha: f.fecha, urgente: false, listo,
			titulo: f.n > 1 ? `${f.n} fotos de ${f.nombre || 'un cliente'} ocultas al socio` : `Foto de ${f.nombre || 'un cliente'} oculta al socio`,
			detalle: [f.codigo, f.casa, f.marca].filter(Boolean).join(' · ')
		});
	}
	for (const c of comprobantes) out.push({
		clave: `comprobante_${c.codigo}`, tipo: 'comprobante', icono: 'icon-money', href: enlaceSolicitud(c.codigo), fecha: c.fecha, urgente: false,
		titulo: `${c.socio || 'El socio'} subió el pago de la ganancia de EQ`, detalle: [c.codigo, c.casa, 'revísalo y márcalo pagado'].filter(Boolean).join(' · ')
	});
	for (const c of comisiones) out.push({
		clave: `comision_${c.codigo}`, tipo: 'comision', icono: 'icon-money', href: enlaceSolicitud(c.codigo), fecha: c.vence ? Date.parse(`${c.vence}T00:00:00-06:00`) : ahora, urgente: c.nivel >= 2,
		titulo: c.nivel >= 3 ? 'Tu pago a EQ tiene más de 72 h de atraso' : c.nivel === 2 ? 'Tu pago a EQ tiene más de 24 h de atraso' : 'Tu pago a EQ ya venció',
		detalle: [c.codigo, c.casa, 'sube el comprobante'].filter(Boolean).join(' · ')
	});
	for (const c of comentarios) {
		if (!c.fecha || ahora - c.fecha > DIAS_COMENTARIO * DIA) continue;
		const listo = { tipo: 'cambios', objeto: c.id, agentId: c.agentId || '' };
		const clave = claveListo(listo);
		if (atendidos.has(clave)) continue;
		out.push({
			clave, tipo: 'cambios', icono: 'icon-pencil', href: `#/propietarios/${encodeURIComponent(c.propietarioId)}`, fecha: c.fecha, urgente: false, listo,
			titulo: `${c.dueno || 'Un dueño'} pide cambios`, detalle: [c.casa, c.texto ? `«${recorta(c.texto, 80)}»` : ''].filter(Boolean).join(': ')
		});
	}
	for (const e of exclusivas) {
		if (!e.fin || !enVentana(e.dias)) continue;
		const listo = { tipo: 'exclusiva', objeto: e.casaId, fin: e.fin, agentId: e.agentId || '' };
		const clave = claveListo(listo);
		if (atendidos.has(clave)) continue;
		out.push({
			clave, tipo: 'exclusiva', icono: 'icon-key', href: `#/propiedades/${encodeURIComponent(e.casaId)}`, fecha: Date.parse(`${e.fin}T00:00:00-06:00`) - DIAS_EXCLUSIVA * DIA,
			urgente: e.dias <= 7, listo, titulo: textoExclusiva(e.dias), detalle: [e.casa, e.dueno].filter(Boolean).join(' · ')
		});
	}
	// Lo que un dueño cambió él solo de su casa por noche (ya publicado): se va al marcarlo «Listo» o deshacerlo.
	for (const c of cambiosDueno) out.push({
		clave: `cambioDueno_${c.id}`, tipo: 'cambioDueno', icono: 'icon-pencil', href: `#/cambios-dueno/${encodeURIComponent(c.id)}`, fecha: c.fecha, urgente: false,
		titulo: `${c.nombre || 'Un dueño'} cambió su casa`, detalle: [c.casa, c.cuantos ? `${c.cuantos} ${c.cuantos === 1 ? 'cambio' : 'cambios'} · ya publicado` : ''].filter(Boolean).join(' · ')
	});
	// Lead nuevo de la web (formulario de contacto o de una casa): se va solo al cambiarle el estado en Leads.
	// Después de 24 h sin atender va en rojo.
	for (const l of leads) out.push({
		clave: `lead_${l.id}`, tipo: 'lead', icono: 'icon-user-plus', href: '#/leads', fecha: l.creado, urgente: ahora - (l.creado || ahora) > DIA,
		titulo: `${l.nombre || 'Alguien'} dejó sus datos`, detalle: l.casa || 'formulario de contacto'
	});
	return out.sort((a, b) => (b.urgente - a.urgente) || ((b.fecha || 0) - (a.fecha || 0)));
}

// Los «Listo» que hay que buscar en la base para saber qué avisos ya se atendieron (antes de armarlos).
// Solo los que pueden salir (las mismas ventanas que armarAvisos): una lectura por clave.
export function clavesPorRevisar({ solicitudes = [], fotos = [], comentarios = [], exclusivas = [], ahora = Date.now() } = {}) {
	return [
		...solicitudes.filter((s) => s.alerta === 'bloqueada' && s.leadId).map((s) => claveListo({ tipo: 'robo', objeto: s.leadId })),
		...fotos.map((f) => claveListo({ tipo: 'foto', objeto: `${f.leadId}_${f.mensaje}` })),
		...comentarios.filter((c) => c.fecha && ahora - c.fecha <= DIAS_COMENTARIO * DIA).map((c) => claveListo({ tipo: 'cambios', objeto: c.id })),
		...exclusivas.filter((e) => e.fin && enVentana(e.dias)).map((e) => claveListo({ tipo: 'exclusiva', objeto: e.casaId, fin: e.fin }))
	];
}
