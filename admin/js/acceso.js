// Acceso al panel de una persona de Propietarios (propietario o colaborador): la única forma de darle entrada.
// Su usuario del panel (users/{uid}: rol «socio», con su ficha) y un correo de Firebase para que ponga ella su
// contraseña. Nadie ve ni escribe una contraseña: la que se crea aquí es al azar y se descarta.
// En la ficha queda una copia del estado («acceso») para que el asesor, que no lee los usuarios, sepa si entra.
// Lo usan la ficha de la persona (views/propietarios.js) y Usuarios (views/users.js).
import { auth, db, doc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp, createAccount, sendPasswordResetEmail, firestoreRest } from './firebase.js';
import { session } from './session.js';
import { nuevoToken, reglasNuevasSegun } from './duenos.js';

export const correoDe = (v) => String(v || '').trim().toLowerCase();

// ¿Ya están publicadas las reglas nuevas de la base? (ver reglasNuevasSegun). Solo el «sí» se recuerda: mientras sea
// «no» (o no hubo red) se vuelve a preguntar cada vez, para que todo se habilite solo al publicarlas.
let reglasPublicadas = false;
export async function reglasNuevas() {
	if (reglasPublicadas) return true;
	try {
		const r = await fetch(`${firestoreRest}/portalPropietarios/prueba-reglas`, { cache: 'no-store' });
		reglasPublicadas = reglasNuevasSegun(r.status, await r.json().catch(() => null));
	} catch { /* sin red: de antes */ }
	return reglasPublicadas;
}

// Por qué todavía no se le puede abrir (o devolver) la entrada a una persona; '' = sí se puede. Lo revisan darAcceso y
// ponerAcceso mismos, así que vale igual desde la ficha y desde Usuarios. Con las reglas de antes, quien no tiene casas
// por noche podría leer su ficha entera y cambiar el precio de su casa en venta.
export async function motivoParaNoAbrir(prop, porNoche) {
	if (!prop) return 'Su ficha ya no existe: no hay a quién darle acceso.';
	if (!porNoche && !(await reglasNuevas())) return 'Primero hay que publicar las reglas nuevas de la base (ver el aviso en Propietarios).';
	return '';
}

export async function accesosDe(propietarioId) {
	const s = await getDocs(query(collection(db, 'users'), where('propietarioId', '==', propietarioId)));
	return s.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.rol === 'socio');
}
// El acceso vigente: el activo, o el último que tuvo.
export async function accesoDe(propietarioId) {
	const lista = await accesosDe(propietarioId);
	return lista.find((u) => u.activo !== false) || lista.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;
}

// prop: su ficha (null si ya no existe: entonces solo se puede apagar).
export async function ponerAcceso(prop, u, activo, { porNoche = false } = {}) {
	const motivo = activo ? await motivoParaNoAbrir(prop, porNoche) : '';
	if (motivo) throw new Error(motivo);
	await updateDoc(doc(db, 'users', u.uid), { activo, updatedAt: serverTimestamp() });
	if (!prop) return;
	await updateDoc(doc(db, 'propietarios', prop.id), { acceso: { email: u.email, activo } }).catch((err) => { if (err?.code !== 'not-found') throw err; });
	prop.acceso = { email: u.email, activo };
}

// Cuentas creadas en esta sesión cuyo usuario del panel no se alcanzó a guardar: el siguiente clic lo termina
// (sin esto, la cuenta quedaría huérfana y el correo, «ya en uso» para siempre).
const sinTerminar = new Map();

const guardarUsuario = (uid, prop, email, nombre) => setDoc(doc(db, 'users', uid), {
	nombre: nombre || '', email, rol: 'socio', propietarioId: prop.id, agentId: '', activo: true,
	createdAt: serverTimestamp(), createdBy: session.user.uid
});

// Devuelve el aviso para mostrar; si no se puede, lanza un error que dice qué hacer.
export async function darAcceso(prop, correo, nombre, { porNoche = false } = {}) {
	const motivo = await motivoParaNoAbrir(prop, porNoche);
	if (motivo) throw new Error(motivo);
	const email = correoDe(correo);
	let uid = sinTerminar.get(email);
	if (!uid) {
		try {
			uid = await createAccount(email, nuevoToken());
		} catch (err) {
			if (err?.code !== 'auth/email-already-in-use') throw err;
			// Usuarios guardados con ese correo (los de antes pueden tenerlo con mayúsculas).
			const s = await getDocs(query(collection(db, 'users'), where('email', 'in', [...new Set([email, String(correo || '').trim()])])));
			const usuarios = s.docs.map((d) => ({ uid: d.id, ...d.data() }));
			const suyo = usuarios.find((u) => u.propietarioId === prop.id && u.rol === 'socio');
			if (suyo) {
				await ponerAcceso(prop, suyo, true, { porNoche });
				await sendPasswordResetEmail(auth, email);
				return `${email} ya tenía su cuenta: se la devolvimos y le enviamos el correo para poner su contraseña.`;
			}
			if (usuarios.length) throw new Error(`${email} ya entra al panel como otra persona (${usuarios[0].nombre || usuarios[0].rol}). Poné otro correo en esta ficha y tocá «Dar acceso» de nuevo.`);
			throw new Error(`${email} ya tiene una cuenta para entrar, pero sin acceso al panel (puede ser de cuando entraba al portal con su correo). Desde aquí no se puede usar. Para arreglarlo: consola de Firebase → Authentication → Usuarios → buscá ${email} → ⋮ → Borrar cuenta. Después tocá «Dar acceso» otra vez.`);
		}
	}
	// El usuario del panel: si falla, se intenta una vez más; si vuelve a fallar, el próximo clic sigue desde aquí.
	try {
		await guardarUsuario(uid, prop, email, nombre).catch(() => guardarUsuario(uid, prop, email, nombre));
	} catch (err) {
		sinTerminar.set(email, uid);
		throw new Error(`Se creó la cuenta de ${email}, pero no se pudo terminar de darle acceso (${err?.code || err?.message || 'error'}). Tocá «Dar acceso» otra vez: sigue donde quedó.`);
	}
	sinTerminar.delete(email);
	// Una sola entrada por persona: si tenía otra (p. ej. con su correo de antes), queda desactivada.
	for (const otro of await accesosDe(prop.id)) if (otro.uid !== uid && otro.activo !== false) await updateDoc(doc(db, 'users', otro.uid), { activo: false, updatedAt: serverTimestamp() });
	await updateDoc(doc(db, 'propietarios', prop.id), { acceso: { email, activo: true } });
	prop.acceso = { email, activo: true };
	await sendPasswordResetEmail(auth, email);
	return `Listo: le enviamos a ${email} un correo para que ponga su contraseña y entre al panel.`;
}
