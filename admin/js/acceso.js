// Acceso al panel de una persona de Propietarios (propietario o colaborador): la única forma de darle entrada.
// Su usuario del panel (users/{uid}: rol «socio», con su ficha) y un correo de Firebase para que ponga ella su
// contraseña. Nadie ve ni escribe una contraseña: la que se crea aquí es al azar y se descarta.
// En la ficha queda una copia del estado («acceso») para que el asesor, que no lee los usuarios, sepa si entra.
// Lo usan la ficha de la persona (views/propietarios.js) y Usuarios (views/users.js).
import { auth, db, doc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp, createAccount, sendPasswordResetEmail } from './firebase.js';
import { session } from './session.js';
import { nuevoToken } from './duenos.js';

export const correoDe = (v) => String(v || '').trim().toLowerCase();

export async function accesosDe(propietarioId) {
	const s = await getDocs(query(collection(db, 'users'), where('propietarioId', '==', propietarioId)));
	return s.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.rol === 'socio');
}
// El acceso vigente: el activo, o el último que tuvo.
export async function accesoDe(propietarioId) {
	const lista = await accesosDe(propietarioId);
	return lista.find((u) => u.activo !== false) || lista.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] || null;
}

export async function ponerAcceso(prop, u, activo) {
	await updateDoc(doc(db, 'users', u.uid), { activo, updatedAt: serverTimestamp() });
	// (Si la ficha ya no existe, no hay copia que poner al día.)
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
export async function darAcceso(prop, correo, nombre) {
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
				await ponerAcceso(prop, suyo, true);
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
	await updateDoc(doc(db, 'propietarios', prop.id), { acceso: { email, activo: true } });
	prop.acceso = { email, activo: true };
	await sendPasswordResetEmail(auth, email);
	return `Listo: le enviamos a ${email} un correo para que ponga su contraseña y entre al panel.`;
}
