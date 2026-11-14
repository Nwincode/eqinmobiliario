// Inventario inventado para probar el sitio generado (scripts/test-sitio.mjs y capturas de pantalla): zonas con
// 3 o más casas (se indexan, con precios) y zonas con una sola (no se indexan), venta, renta y por noche, US$ y Q,
// casas traducidas al inglés, una VIP y una vendida. Nada de esto es real ni va a la base de datos.
// Se arma sobre data/seed.json (textos, colores, asesores) cambiando solo las propiedades y un artículo.
import { readFileSync } from 'node:fs';

const FOTOS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ url: `/images/img_${i}.webp` }));
const fotos = (k, n = 4) => Array.from({ length: n }, (_, i) => FOTOS[(k + i) % FOTOS.length]);

let n = 0;
function casa(d) {
	n++;
	const id = `ejemplo-${n}`;
	const titulo = d.titulo || `${{ casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno' }[d.tipo || 'casa']} ${{ venta: 'en venta', renta: 'en renta', vacacional: 'para vacacionar' }[d.operacion || 'venta']} en ${d.zona} ${n}`;
	return {
		id, titulo, operacion: 'venta', tipo: 'casa', moneda: 'USD', ciudad: 'Guatemala', estado: 'disponible', publicado: true,
		habitaciones: 3, banos: 2, parqueos: 2, m2Construccion: 200, amenidades: ['Jardín', 'Garita de seguridad'],
		descripcion: `${titulo}. Propiedad de ejemplo para probar el sitio: amplia, iluminada y cerca de servicios.`,
		fotos: fotos(n, 4), createdAt: `2026-0${(n % 9) + 1}-10T12:00:00Z`, updatedAt: `2026-10-${String((n % 27) + 1).padStart(2, '0')}T12:00:00Z`,
		agentId: 'joaquin-arriola', seo: {},
		...d,
		en: d.en === false ? undefined : {
			titulo: `${{ casa: 'House', apartamento: 'Condo', terreno: 'Lot' }[d.tipo || 'casa']} ${{ venta: 'for sale', renta: 'for rent', vacacional: 'vacation rental' }[d.operacion || 'venta']} in ${d.zona} ${n}`,
			descripcion: `Example listing used to test the site: bright, spacious and close to services in ${d.zona}.`, amenidades: [], seo: {}
		}
	};
}

export function propiedadesEjemplo() {
	n = 0;
	return [
		// Zona 16: 4 casas y 1 apartamento en venta (US$) → zona, zona + venta no (igual a la zona), casas en venta en zona 16.
		casa({ zona: 'Zona 16', precio: 350000, m2Construccion: 250, destacada: true }),
		casa({ zona: 'Zona 16', precio: 420000, m2Construccion: 300, habitaciones: 4 }),
		casa({ zona: 'Zona 16', precio: 515000, m2Construccion: 340, habitaciones: 4, vip: true, vipLanding: { titular: 'Casa con vista al bosque' } }),
		casa({ zona: 'Zona 16', precio: 289000, m2Construccion: 210 }),
		casa({ zona: 'Zona 16', tipo: 'apartamento', precio: 198000, m2Construccion: 120, habitaciones: 2 }),
		// Zona 10: 3 apartamentos en venta y 3 en renta → zona + venta y zona + renta.
		casa({ zona: 'Zona 10', tipo: 'apartamento', precio: 280000, m2Construccion: 150 }),
		casa({ zona: 'Zona 10', tipo: 'apartamento', precio: 310000, m2Construccion: 160 }),
		casa({ zona: 'Zona 10', tipo: 'apartamento', precio: 365000, m2Construccion: 175 }),
		casa({ zona: 'Zona 10', tipo: 'apartamento', operacion: 'renta', precio: 1500, m2Construccion: 110 }),
		casa({ zona: 'Zona 10', tipo: 'apartamento', operacion: 'renta', precio: 1800, m2Construccion: 130 }),
		casa({ zona: 'Zona 10', tipo: 'apartamento', operacion: 'renta', precio: 2200, m2Construccion: 150, en: false }),
		// Zona 15: 3 casas en venta en quetzales y un apartamento en renta (así «renta en zona 10» no es toda la renta).
		casa({ zona: 'Zona 15', moneda: 'GTQ', precio: 2500000, m2Construccion: 260 }),
		casa({ zona: 'Zona 15', moneda: 'GTQ', precio: 2900000, m2Construccion: 280 }),
		casa({ zona: 'Zona 15', moneda: 'GTQ', precio: 3400000, m2Construccion: 320 }),
		casa({ zona: 'Zona 15', tipo: 'apartamento', operacion: 'renta', moneda: 'GTQ', precio: 9500, m2Construccion: 90 }),
		// Zona 1: una sola → la zona existe sin indexar. Con dirección que ya dice la zona.
		casa({ zona: 'Zona 1', tipo: 'apartamento', moneda: 'GTQ', precio: 970000, direccion: 'Centro Vivo, zona 1', m2Construccion: 62, habitaciones: 1 }),
		// Monterrico: 3 casas por noche (destino), con el formato viejo de descripción en una.
		casa({ zona: 'Monterrico', operacion: 'vacacional', precio: 120, habitaciones: 4, vacacional: { base: 120, huespedesMax: 8, nochesMin: 2 },
			descripcion: 'Casa frente al mar en Monterrico.\n\n**Características de la propiedad**\n- Hasta 1 huésped\n\n**Amenidades**\n- Piscina\n\n**Para tu estadía**\n- Estadía mínima: 1 noche\n- Revisá el calendario para ver las fechas disponibles' }),
		casa({ zona: 'Monterrico', operacion: 'vacacional', precio: 150, vacacional: { base: 150, huespedesMax: 6 } }),
		casa({ zona: 'Monterrico', operacion: 'vacacional', precio: 95, vacacional: { base: 95, huespedesMax: 4 } }),
		// Un terreno fuera de la capital (departamento por municipio) y una casa vendida (solo con enlace).
		casa({ zona: 'Km 16.6 Carretera a El Salvador', ciudad: 'Santa Catarina Pinula', tipo: 'terreno', precio: 150000, habitaciones: 0, banos: 0, m2Construccion: 0, m2Terreno: 1000,
			titulo: 'Terreno en venta, camino Piedra Parada, km 16.6 Carretera a El Salvador' }),
		casa({ zona: 'Zona 16', precio: 600000, estado: 'vendida' })
	];
}

// Datos completos para el generador (formato de data/seed.json).
export function seedEjemplo(seedPath) {
	const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
	return {
		...seed,
		properties: propiedadesEjemplo(),
		posts: [...(seed.posts || []), {
			id: 'ejemplo-guia', titulo: 'Guía de ejemplo para comprar en zona 14', slug: 'guia-ejemplo-zona-14', publicado: true, fecha: '2026-10-01',
			resumen: 'Artículo de ejemplo con enlaces a listados que no existen: cada uno debe llevar al listado padre que sí tiene casas.',
			contenido: 'Mira las [casas en zona 14](/propiedades/zona-14/), las [casas en renta en zona 16](/casas-en-renta/zona-16/) y las [casas en venta en zona 16](/casas-en-venta/zona-16/).'
		}]
	};
}
