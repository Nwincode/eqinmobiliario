// Si Firebase no carga (sin internet o bloqueado por la red), avisar en vez de quedarse cargando. Script clásico y en su
// archivo (no en línea): la regla de seguridad del panel (netlify.toml, CSP) no deja correr código en el HTML.
setTimeout(function () {
	var app = document.getElementById('app');
	if (!app || !/Cargando panel/.test(app.textContent)) return;
	var caja = document.createElement('div');
	caja.className = 'd-flex flex-column align-items-center justify-content-center text-center p-4 min-vh-100';
	var texto = document.createElement('p');
	texto.className = 'mb-3';
	texto.textContent = 'No se pudo cargar el panel. Revisa tu conexión a internet o que la red no bloquee www.gstatic.com.';
	var boton = document.createElement('button');
	boton.className = 'btn btn-primary';
	boton.textContent = 'Reintentar';
	boton.addEventListener('click', function () { location.reload(); });
	caja.append(texto, boton);
	app.replaceChildren(caja);
}, 20000);
