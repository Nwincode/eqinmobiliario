// ZIP mínimo (sin compresión) para descargar fotos desde el navegador.
// Las fotos ya vienen comprimidas (WebP/JPEG), así que comprimir de nuevo no ahorraría espacio.

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes) {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
	return {
		time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
		date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
	};
}

// archivos: [{ nombre, datos: Uint8Array }] → Blob application/zip
export function crearZip(archivos) {
	const enc = new TextEncoder();
	const { time, date } = dosTime(new Date());
	const partes = [];
	const central = [];
	let offset = 0;
	for (const { nombre, datos } of archivos) {
		const name = enc.encode(nombre);
		const crc = crc32(datos);
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, 0x0800, true); // nombres en UTF-8
		local.setUint16(8, 0, true);
		local.setUint16(10, time, true);
		local.setUint16(12, date, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, datos.length, true);
		local.setUint32(22, datos.length, true);
		local.setUint16(26, name.length, true);
		partes.push(local.buffer, name, datos);

		const cen = new DataView(new ArrayBuffer(46));
		cen.setUint32(0, 0x02014b50, true);
		cen.setUint16(4, 20, true);
		cen.setUint16(6, 20, true);
		cen.setUint16(8, 0x0800, true);
		cen.setUint16(10, 0, true);
		cen.setUint16(12, time, true);
		cen.setUint16(14, date, true);
		cen.setUint32(16, crc, true);
		cen.setUint32(20, datos.length, true);
		cen.setUint32(24, datos.length, true);
		cen.setUint16(28, name.length, true);
		cen.setUint32(42, offset, true);
		central.push(cen.buffer, name);
		offset += 30 + name.length + datos.length;
	}
	const tamCentral = central.reduce((s, b) => s + b.byteLength, 0);
	const fin = new DataView(new ArrayBuffer(22));
	fin.setUint32(0, 0x06054b50, true);
	fin.setUint16(8, archivos.length, true);
	fin.setUint16(10, archivos.length, true);
	fin.setUint32(12, tamCentral, true);
	fin.setUint32(16, offset, true);
	return new Blob([...partes, ...central, fin.buffer], { type: 'application/zip' });
}

export function descargarBlob(blob, nombre) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = nombre;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
