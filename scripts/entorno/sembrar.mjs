// Entorno de pruebas local: llena los emuladores con datos inventados.
//  - El contenido inicial del sitio (data/seed.json), igual que «Importar datos iniciales» del panel.
//  - Usuarios para entrar al panel: administrador, asesor, socio y colaborador. La contraseña es la misma para
//    todos y solo existe aquí. A la dueña mixta (una casa en venta y otra por noche) le da acceso el recorrido.
import { readFile } from 'node:fs/promises';

const PROYECTO = 'demo-eq';
const FS = `http://${process.env.EMU_FIRESTORE || '127.0.0.1:8085'}/v1/projects/${PROYECTO}/databases/(default)/documents`;
const AUTH = `http://${process.env.EMU_AUTH || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1`;
export const CLAVE = 'Pruebas-2026';
export const USUARIOS = {
	admin: { email: 'admin@example.com', perfil: { nombre: 'Admin de prueba', rol: 'admin', activo: true } },
	asesor: { email: 'asesor@example.com', perfil: { nombre: 'Asesor de prueba', rol: 'asesor', activo: true, agentId: 'asesor-prueba' } },
	socio: { email: 'socio@example.com', perfil: { nombre: 'Socio de prueba', rol: 'socio', activo: true, propietarioId: 'socio-prueba' } },
	colab: { email: 'colab@example.com', perfil: { nombre: 'Colaborador de prueba', rol: 'socio', activo: true, propietarioId: 'colab-prueba' } }
};

const valor = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
	: typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
	: Array.isArray(v) ? { arrayValue: { values: v.map(valor) } } : { mapValue: { fields: campos(v) } };
const campos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, valor(v)]));
// Cambia solo esos campos de un documento que ya existe.
async function cambiar(ruta, datos) {
	const mascara = Object.keys(datos).map((k) => `updateMask.fieldPaths=${k}`).join('&');
	const r = await fetch(`${FS}/${ruta}?${mascara}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: campos(datos) }) });
	if (!r.ok) throw new Error(`No se pudo cambiar ${ruta}: ${r.status} ${await r.text()}`);
}
async function poner(ruta, datos) {
	const ahora = { timestampValue: new Date().toISOString() };
	const r = await fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { ...campos(datos), createdAt: ahora, updatedAt: ahora } }) });
	if (!r.ok) throw new Error(`No se pudo guardar ${ruta}: ${r.status} ${await r.text()}`);
}

const seed = JSON.parse(await readFile(new URL('../../data/seed.json', import.meta.url), 'utf8'));
await poner('settings/site', seed.settings);
for (const [col, lista] of [['properties', seed.properties], ['agents', seed.agents], ['testimonials', seed.testimonials], ['pages', seed.pages], ['posts', seed.posts || []]]) {
	for (const { id, ...resto } of lista) await poner(`${col}/${id}`, resto);
}
// El socio y un propietario de cada asesor, para probar qué ve cada rol.
// El socio ya tenía el portal de antes (enlace por WhatsApp): su copia vieja no trae datos de pago ni versión.
const PORTAL_VIEJO = 'PortalViejoDelSocioDePruebaLargoYAlAzar123';
await poner('propietarios/socio-prueba', { tipo: 'socio', nombre: 'Socio de prueba', telefono: '+502 5555 0001', email: 'socio@example.com', agentId: '', propiedades: [],
	datosPago: 'Banco de prueba, cuenta monetaria 123-456789-0, a nombre de Socio de prueba', portalToken: PORTAL_VIEJO });
await poner(`portalPropietarios/${PORTAL_VIEJO}`, { v: 2, email: 'socio@example.com', agentId: '', propietarioId: 'socio-prueba', nombre: 'Socio', exclusivaFin: '', propiedades: [] });
await poner('propietarios/dueno-del-asesor', { tipo: 'propietario', nombre: 'Dueño del asesor', telefono: '+502 5555 0003', agentId: 'asesor-prueba', propiedades: [] });
await poner('agents/asesor-prueba', { nombre: 'Asesor de prueba', activo: true, orden: 99, email: 'asesor@example.com', whatsapp: '50255550002' });
// Un asesor creado sin «orden» (crud.js no lo guarda si se deja vacío): tiene que salir en las listas igual.
await poner('agents/asesora-sin-orden', { nombre: 'Asesora sin orden (prueba)', activo: true, email: 'sinorden@example.com' });
// Un solo panel por dueño: una dueña con una casa en venta y otra por noche, y un colaborador con una casa en venta.
await poner('propietarios/dueno-mixto', { tipo: 'propietario', nombre: 'Dueña mixta de prueba', telefono: '+502 5555 0004', email: 'mixta@example.com', agentId: 'asesor-prueba', porNoche: true,
	propiedades: [{ propertyId: 'residencial-san-antonio' }, { propertyId: 'casa-noche-mixta' }], notas: 'NOTA INTERNA de prueba: no la ve la dueña',
	datosPago: 'Banco de prueba, cuenta 999-0001, a nombre de Dueña mixta' });
await cambiar('properties/residencial-san-antonio', { propietarioId: 'dueno-mixto', agentId: 'asesor-prueba' });
await poner('properties/residencial-san-antonio/privado/acuerdo', { exclusiva: true, exclusivaFin: '2027-06-30', comisionPct: 4 });
await poner('properties/casa-noche-mixta', { titulo: 'Casa por noche de la dueña mixta (prueba)', slug: 'casa-noche-mixta', codigo: 'MIX-1', operacion: 'vacacional', tipo: 'casa', publicado: false,
	propietarioId: 'dueno-mixto', zona: 'Antigua', ciudad: 'Sacatepéquez', moneda: 'USD', precio: 108, habitaciones: 2, descripcion: 'REGISTRO DE PRUEBA.', vacacional: { base: 108, huespedesMax: 4 } });
await poner('properties/casa-noche-mixta/privado/socio', { precioBase: 90, margen: 20 });
await poner('propietarios/colab-prueba', { tipo: 'colaborador', empresa: 'Inmobiliaria Aliada', nombre: 'Colaborador de prueba', telefono: '+502 5555 0005', email: 'colab@example.com', agentId: 'asesor-prueba',
	propiedades: [{ propertyId: 'jardines-de-mirabel' }] });
await cambiar('properties/jardines-de-mirabel', { propietarioId: 'colab-prueba', agentId: 'asesor-prueba' });
for (const u of Object.values(USUARIOS)) {
	const r = await fetch(`${AUTH}/accounts:signUp?key=pruebas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: CLAVE, returnSecureToken: true }) });
	const cuerpo = await r.json();
	if (!r.ok && cuerpo.error?.message !== 'EMAIL_EXISTS') throw new Error(`No se pudo crear ${u.email}: ${JSON.stringify(cuerpo)}`);
	if (cuerpo.localId) await poner(`users/${cuerpo.localId}`, { ...u.perfil, email: u.email });
}
console.log(`Datos inventados listos: ${seed.properties.length + 1} propiedades y ${Object.keys(USUARIOS).length} usuarios (${Object.keys(USUARIOS).join(', ')}).`);
