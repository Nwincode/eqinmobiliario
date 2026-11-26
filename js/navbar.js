(function(){

	'use strict'


	var siteMenuClone = function() {
		var jsCloneNavs = document.querySelectorAll('.js-clone-nav');
		var siteMobileMenuBody = document.querySelector('.site-mobile-menu-body');
		// Las landing VIP no tienen menú.
		if (!siteMobileMenuBody) return;



		jsCloneNavs.forEach(nav => {
			var navCloned = nav.cloneNode(true);
			navCloned.setAttribute('class', 'site-nav-wrap');
			siteMobileMenuBody.appendChild(navCloned);
		});

		setTimeout(function(){

			var hasChildrens = document.querySelector('.site-mobile-menu').querySelectorAll(' .has-children');

			var counter = 0;
			hasChildrens.forEach( hasChild => {
				
				var refEl = hasChild.querySelector('a');

				// La flecha es un botón (se alcanza con el teclado y dice si está abierto).
				var newElSpan = document.createElement('button');
				newElSpan.setAttribute('type', 'button');
				newElSpan.setAttribute('class', 'arrow-collapse collapsed');
				newElSpan.setAttribute('aria-expanded', 'false');
				newElSpan.setAttribute('aria-label', refEl.textContent.trim());

				// prepend equivalent to jquery
				hasChild.insertBefore(newElSpan, refEl);

				var arrowCollapse = hasChild.querySelector('.arrow-collapse');
				arrowCollapse.setAttribute('data-bs-toggle', 'collapse');
				arrowCollapse.setAttribute('data-bs-target', '#collapseItem' + counter);

				var dropdown = hasChild.querySelector('.dropdown');
				dropdown.setAttribute('class', 'collapse');
				dropdown.setAttribute('id', 'collapseItem' + counter);
				arrowCollapse.setAttribute('aria-controls', 'collapseItem' + counter);
				dropdown.addEventListener('shown.bs.collapse', function () { arrowCollapse.setAttribute('aria-expanded', 'true'); });
				dropdown.addEventListener('hidden.bs.collapse', function () { arrowCollapse.setAttribute('aria-expanded', 'false'); });

				counter++;
			});

		}, 1000);


		// Abrir y cerrar: un solo lugar cambia la clase del body y el estado de los botones.
		var menuToggle = document.querySelectorAll(".js-menu-toggle");
		var menu = document.querySelector(".site-mobile-menu");
		// Abierto, el menú y la barra de arriba (la ✕ y ES/EN) son lo único que se recorre con el teclado: el foco entra al
		// primer enlace y el resto de la página queda inerte; al cerrarlo, vuelve al botón.
		var poner = function (abrir) {
			var estaba = document.body.classList.contains('offcanvas-menu');
			document.body.classList.toggle('offcanvas-menu', abrir);
			menuToggle.forEach(function (t) {
				t.classList.toggle('active', abrir);
				t.setAttribute('aria-expanded', abrir ? 'true' : 'false');
			});
			if (!menu) return;
			menu.setAttribute('aria-hidden', abrir ? 'false' : 'true');
			menu.inert = !abrir;
			Array.prototype.forEach.call(document.body.children, function (el) { if (el !== menu && el.tagName !== 'SCRIPT' && !el.querySelector('.burger')) el.inert = abrir; });
			if (abrir && !estaba) { var primero = menu.querySelector('.site-nav-wrap a'); if (primero) primero.focus(); }
			if (!abrir && estaba && menu.contains(document.activeElement)) { var b = document.querySelector('.burger.js-menu-toggle'); if (b) b.focus(); }
		};
		var abierto = function () { return document.body.classList.contains('offcanvas-menu'); };
		poner(false);
		menuToggle.forEach(function (t) {
			t.addEventListener("click", function (e) { e.preventDefault(); poner(!abierto()); });
		});

		// Escape cierra el menú y devuelve el foco al botón.
		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Escape' || !abierto()) return;
			poner(false);
		});

		// Se cierra al tocar fuera o al elegir un enlace: así la página puede bajar a la sección (#contacto, #servicios).
		document.addEventListener('click', function (e) {
			if (!abierto() || e.target.closest('.js-menu-toggle')) return;
			if (!menu.contains(e.target) || e.target.closest('a[href]')) poner(false);
		});

	}; 
	siteMenuClone();


})()