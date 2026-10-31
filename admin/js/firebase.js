// Inicializa Firebase con la configuración pública de /site.config.json.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
	getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
	createUserWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
	initializeFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
	orderBy, limit, serverTimestamp, writeBatch, arrayUnion, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
	getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const res = await fetch('/site.config.json', { cache: 'no-store' });
export const siteConfig = await res.json();
export const firebaseConfig = siteConfig.firebase || {};
export const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
// ignoreUndefinedProperties: un campo sin valor no hace fallar el guardado.
export const db = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : null;
export const storage = app && firebaseConfig.storageBucket ? getStorage(app) : null;

// Crea una cuenta sin cerrar la sesión del administrador (usa una app secundaria).
export async function createAccount(email, password) {
	const secondary = initializeApp(firebaseConfig, `alta-${Date.now()}`);
	try {
		const secAuth = getAuth(secondary);
		const cred = await createUserWithEmailAndPassword(secAuth, email, password);
		await signOut(secAuth);
		return cred.user.uid;
	} finally {
		await deleteApp(secondary);
	}
}

export {
	onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
	createUserWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
	doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, limit,
	serverTimestamp, writeBatch, arrayUnion, Timestamp,
	ref, uploadBytes, getDownloadURL, deleteObject
};
