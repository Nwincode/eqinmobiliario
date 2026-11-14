(function () {

	'use strict'


	// Quien pidió menos movimiento al sistema (prefers-reduced-motion) ve todo quieto: sin animaciones al bajar
	// y sin carruseles que avanzan solos (WCAG 2.2.2).
	var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	AOS.init({
		duration: 800,
		easing: 'slide',
		once: true,
		disable: quieto
	});

	// Un carrusel que avanza solo se detiene mientras el cursor o el foco del teclado están en él
	// (tiny-slider hace lo del cursor con autoplayHoverPause; el foco, aquí).
	var pausaConFoco = function (carrusel) {
		var info = carrusel && carrusel.getInfo();
		var caja = info && info.container && info.container.closest('.tns-outer');
		if (!caja || quieto) return carrusel;
		caja.addEventListener('focusin', function () { carrusel.pause(); });
		caja.addEventListener('focusout', function (e) { if (!caja.contains(e.relatedTarget)) carrusel.play(); });
		return carrusel;
	};
	// Opciones de todo carrusel que avanza solo.
	var solo = function (opciones) {
		opciones.autoplay = !quieto;
		opciones.autoplayHoverPause = true;
		return opciones;
	};

	// Carrusel con flechas propias (#property-nav, #testimonial-nav). tiny-slider le pone al
	// grupo un nombre en inglés y saca los botones del orden de tabulación; aquí se deja el
	// nombre en el idioma de la página y cada flecha alcanzable con Tab (las teclas ← → siguen).
	var conFlechas = function (opciones) {
		var grupo = document.querySelector(opciones.controlsContainer);
		var nombre = grupo && grupo.getAttribute('aria-label');
		var carrusel = pausaConFoco(tns(solo(opciones)));
		if (grupo && grupo.isConnected) {
			if (nombre) grupo.setAttribute('aria-label', nombre);
			grupo.removeAttribute('tabindex');
			grupo.querySelectorAll('[data-controls]').forEach(function (b) { b.removeAttribute('tabindex'); });
		}
		return carrusel;
	};

	var tinySdlier = function() {

		var heroSlider = document.querySelectorAll('.hero-slide');
		var propertySlider = document.querySelectorAll('.property-slider');
		var imgPropertySlider = document.querySelectorAll('.img-property-slide');
		var testimonialSlider = document.querySelectorAll('.testimonial-slider');
		

		if ( heroSlider.length > 0 ) {
			pausaConFoco(tns(solo({
				container: '.hero-slide',
				mode: 'carousel',
				speed: 700,
				controls: false,
				nav: false,
				autoplayButtonOutput: false,
				controlsContainer: '#hero-nav',
			})));
			// Solo la primera foto se descarga con la página; las demás, cuando ya cargó.
			var fondos = function() {
				document.querySelectorAll('.hero-slide [data-bg]').forEach(function(el) {
					el.style.cssText = el.getAttribute('data-bg');
				});
			};
			if (document.readyState === 'complete') fondos();
			else window.addEventListener('load', fondos);
		}


		if ( imgPropertySlider.length > 0 ) {
			pausaConFoco(tns(solo({
				container: '.img-property-slide',
				mode: 'carousel',
				speed: 700,
				items: 1,
				gutter: 30,
				controls: false,
				nav: false,
				autoplayButtonOutput: false
			})));
		}

		if ( propertySlider.length> 0 ) {
			conFlechas({
				container: '.property-slider',
				mode: 'carousel',
				speed: 700,
				gutter: 30,
				items: 3,
				// Sin puntos: solo las flechas finas (regla de carruseles).
				nav: false,
				autoplayButtonOutput: false,
				controlsContainer: '#property-nav',
				responsive: {
					0: {
						items: 1
					},
					700: {
						items: 2
					},
					900: {
						items: 3
					}
				}
			});
		}


		// Las reseñas de Google llegan después (site.js las agrega como diapositivas y
		// vuelve a armar este mismo carrusel con window.eqIniciarTestimonios(preparar)).
		// destroy() devuelve el HTML original; «preparar» lo modifica antes de armarlo otra vez.
		var carruselTestimonios = null;
		window.eqIniciarTestimonios = function (preparar) {
			if (carruselTestimonios) { carruselTestimonios.destroy(); carruselTestimonios = null; }
			var cont = document.querySelector('.testimonial-slider');
			if (cont && preparar) preparar(cont);
			if (!cont || !cont.children.length) return null;
			carruselTestimonios = conFlechas({
				container: '.testimonial-slider',
				mode: 'carousel',
				speed: 700,
				items: 3,
				gutter: 50,
				nav: false,
				autoplayButtonOutput: false,
				controlsContainer: '#testimonial-nav',
				responsive: {
					0: {
						items: 1
					},
					700: {
						items: 2
					},
					900: {
						items: 3
					}
				}
			});
			return carruselTestimonios;
		};
		if ( testimonialSlider.length> 0 ) {
			window.eqIniciarTestimonios();
		}
	}
	tinySdlier();

	// Los carruseles cambian la altura de la página después de AOS.init; sin recalcular,
	// los bloques del final (como «Sé parte de nuestro equipo») se quedaban invisibles.
	AOS.refresh();
	window.addEventListener('load', function () { AOS.refresh(); });



})()