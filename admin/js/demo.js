// Propiedades de prueba: sirven para probar el panel, la subida de fotos y el sitio.
// Todas llevan demo: true para poder borrarlas juntas. Nacen como toda propiedad (propiedadNueva: historial, quién la
// creó y el asesor de quien la crea), con operaciones y valores que acepta el panel.
import { db, doc, getDocs, setDoc, deleteDoc, collection, query, where } from './firebase.js';
import { uploadImage, deleteImage } from './form.js';
import { markPending } from './session.js';

const DEMOS = [
	{
		id: 'prueba-casa-zona-16', fotos: ['img_2.jpg', 'img_5.jpg', 'img_6.jpg'],
		titulo: 'Casa de prueba en zona 16', operacion: 'venta', tipo: 'casa', precio: 425000, moneda: 'USD',
		zona: 'Zona 16', habitaciones: 4, banos: 3.5, parqueos: 3, m2Construccion: 380, m2Terreno: 450,
		amenidades: ['Jardín', 'Garita de seguridad', 'Cuarto de servicio'],
		descripcion: 'Propiedad de prueba para revisar cómo se ve una ficha completa con varias fotos. Puedes editarla o borrarla desde el panel.',
		en: { titulo: 'Test house in Zona 16', descripcion: 'Test listing used to preview a full property page with several photos.' }
	},
	{
		id: 'prueba-apartamento-zona-15', fotos: ['img_7.jpg', 'img_8.jpg'],
		titulo: 'Apartamento de prueba en zona 15', operacion: 'renta', tipo: 'apartamento', precio: 1400, moneda: 'USD',
		zona: 'Zona 15', habitaciones: 2, banos: 2, parqueos: 2, m2Construccion: 110, m2Terreno: 0,
		amenidades: ['Piscina', 'Gimnasio', 'Área social'],
		descripcion: 'Apartamento de prueba en alquiler. Sirve para ver cómo aparecen las propiedades en renta.',
		en: { titulo: 'Test apartment in Zona 15', descripcion: 'Test rental listing.' }
	},
	{
		id: 'prueba-terreno-carretera-salvador', fotos: ['img_4.jpg'],
		titulo: 'Terreno de prueba en Carretera a El Salvador', operacion: 'venta', tipo: 'terreno', precio: 950000, moneda: 'GTQ',
		zona: 'Carretera a El Salvador', habitaciones: 0, banos: 0, parqueos: 0, m2Construccion: 0, m2Terreno: 1200,
		amenidades: [],
		descripcion: 'Terreno de prueba con una sola foto y precio en quetzales.',
		en: { titulo: 'Test lot on Carretera a El Salvador', descripcion: 'Test land listing priced in quetzales.' }
	}
];

async function fotoDesdeSitio(nombre) {
	const res = await fetch(`/images/${nombre}`);
	if (!res.ok) throw new Error(`No se encontró la foto ${nombre}`);
	const blob = await res.blob();
	return new File([blob], nombre, { type: blob.type || 'image/jpeg' });
}

// Crea las propiedades de prueba subiendo sus fotos a Storage.
export async function cargarDemos({ publicar = false, onProgress = () => {} } = {}) {
	const { propiedadNueva } = await import('./views/properties.js');
	let n = 0;
	for (const { id, fotos, ...datos } of DEMOS) {
		onProgress(`Subiendo fotos de "${datos.titulo}"…`);
		const subidas = [];
		for (const nombre of fotos) subidas.push(await uploadImage(await fotoDesdeSitio(nombre), `properties/${id}`));
		const slug = id;
		await setDoc(doc(db, 'properties', id), propiedadNueva({
			...datos,
			slug,
			ciudad: 'Guatemala',
			direccion: datos.zona,
			fotos: subidas,
			destacada: false,
			vip: false,
			vipLanding: {},
			estado: 'disponible',
			publicado: publicar,
			orden: 90 + n,
			seo: {},
			en: { amenidades: [], seo: {}, ...datos.en },
			demo: true
		}));
		n++;
	}
	await markPending('Propiedades de prueba agregadas');
	return n;
}

// Borra las propiedades de prueba y sus fotos.
export async function borrarDemos() {
	const snap = await getDocs(query(collection(db, 'properties'), where('demo', '==', true)));
	for (const d of snap.docs) {
		for (const f of d.data().fotos || []) await deleteImage(f.path);
		await deleteDoc(d.ref);
	}
	if (snap.size) await markPending('Propiedades de prueba borradas');
	return snap.size;
}
