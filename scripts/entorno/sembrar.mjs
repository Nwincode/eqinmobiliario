// Entorno de pruebas local: llena los emuladores con datos inventados.
//  - El contenido inicial del sitio (data/seed.json), igual que «Importar datos iniciales» del panel.
//  - Tres usuarios para entrar al panel, uno por rol. La contraseña es la misma para los tres y solo existe aquí.
import { readFile } from 'node:fs/promises';

const PROYECTO = 'demo-eq';
const FS = `http://${process.env.EMU_FIRESTORE || '127.0.0.1:8085'}/v1/projects/${PROYECTO}/databases/(default)/documents`;
const AUTH = `http://${process.env.EMU_AUTH || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1`;
export const CLAVE = 'Pruebas-2026';
export const USUARIOS = {
	admin: { email: 'admin@example.com', perfil: { nombre: 'Admin de prueba', rol: 'admin', activo: true } },
	asesor: { email: 'asesor@example.com', perfil: { nombre: 'Asesor de prueba', rol: 'asesor', activo: true, agentId: 'asesor-prueba' } },
	socio: { email: 'socio@example.com', perfil: { nombre: 'Socio de prueba', rol: 'socio', activo: true, propietarioId: 'socio-prueba' } }
};

const valor = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
	: typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
	: Array.isArray(v) ? { arrayValue: { values: v.map(valor) } } : { mapValue: { fields: campos(v) } };
const campos = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, valor(v)]));
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
await poner('propietarios/socio-prueba', { tipo: 'socio', nombre: 'Socio de prueba', telefono: '+502 5555 0001', email: 'socio@example.com', agentId: '', propiedades: [],
	datosPago: 'Banco de prueba, cuenta monetaria 123-456789-0, a nombre de Socio de prueba' });
await poner('propietarios/dueno-del-asesor', { tipo: 'propietario', nombre: 'Dueño del asesor', telefono: '+502 5555 0003', agentId: 'asesor-prueba', propiedades: [] });
await poner('agents/asesor-prueba', { nombre: 'Asesor de prueba', activo: true, email: 'asesor@example.com', whatsapp: '50255550002' });
for (const u of Object.values(USUARIOS)) {
	const r = await fetch(`${AUTH}/accounts:signUp?key=pruebas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: CLAVE, returnSecureToken: true }) });
	const cuerpo = await r.json();
	if (!r.ok && cuerpo.error?.message !== 'EMAIL_EXISTS') throw new Error(`No se pudo crear ${u.email}: ${JSON.stringify(cuerpo)}`);
	if (cuerpo.localId) await poner(`users/${cuerpo.localId}`, { ...u.perfil, email: u.email });
}
console.log(`Datos inventados listos: ${seed.properties.length} propiedades y 3 usuarios (admin, asesor, socio).`);
