// Entorno de pruebas local: hace que el código que habla con Google (Firestore, Storage, la cuenta de servicio)
// y con el servicio de correo hable con los emuladores de esta máquina. Se carga antes del programa:
//   node --import ./scripts/entorno/red-local.mjs <programa>
// No cambia el código de producción: solo redirige sus llamadas. Los correos no se envían: quedan en $CORREOS.
import { appendFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

const DESTINOS = [
	['https://firestore.googleapis.com', `http://${process.env.EMU_FIRESTORE || '127.0.0.1:8085'}`],
	['https://firebasestorage.googleapis.com', `http://${process.env.EMU_STORAGE || '127.0.0.1:9199'}`]
];
// Cuenta de servicio de mentira: el emulador acepta «Bearer owner» como administrador.
process.env.GOOGLE_SA_EMAIL ||= 'pruebas@demo-eq.iam.gserviceaccount.com';
process.env.GOOGLE_SA_KEY ||= generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.ZEPTOMAIL_TOKEN ||= 'pruebas';
process.env.AVISO_CORREO ||= 'equipo@example.com';
process.env.CORREO_REMITENTE ||= 'avisos@example.com';

const real = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
	const url = String(entrada instanceof Request ? entrada.url : entrada);
	if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'owner', expires_in: 3600 });
	if (/^https:\/\/api\.(zeptomail|resend)\./.test(url) || /zeptomail\.[a-z.]+\/v1\.1\/email/.test(url)) {
		if (process.env.CORREOS) appendFileSync(process.env.CORREOS, `${opciones.body}\n`);
		return Response.json({ data: [{ message: 'OK' }], id: 'pruebas' });
	}
	const destino = DESTINOS.find(([de]) => url.startsWith(de));
	return real(destino ? url.replace(destino[0], destino[1]) : entrada, opciones);
};
