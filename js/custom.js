(function () {

	'use strict'


	AOS.init({
		duration: 800,
		easing: 'slide',
		once: true
	});

	var tinySdlier = function() {

		var heroSlider = document.querySelectorAll('.hero-slide');
		var propertySlider = document.querySelectorAll('.property-slider');
		var imgPropertySlider = document.querySelectorAll('.img-property-slide');
		var testimonialSlider = document.querySelectorAll('.testimonial-slider');
		

		if ( heroSlider.length > 0 ) {
			tns({
				container: '.hero-slide',
				mode: 'carousel',
				speed: 700,
				autoplay: true,
				controls: false,
				nav: false,
				autoplayButtonOutput: false,
				controlsContainer: '#hero-nav',
			});
		}


		if ( imgPropertySlider.length > 0 ) {
			tns({
				container: '.img-property-slide',
				mode: 'carousel',
				speed: 700,
				items: 1,
				gutter: 30,
				autoplay: true,
				controls: false,
				nav: true,
				autoplayButtonOutput: false
			});
		}

		if ( propertySlider.length> 0 ) {
			tns({
				container: '.property-slider',
				mode: 'carousel',
				speed: 700,
				gutter: 30,
				items: 3,
				autoplay: true,
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
			carruselTestimonios = tns({
				container: '.testimonial-slider',
				mode: 'carousel',
				speed: 700,
				items: 3,
				gutter: 50,
				autoplay: true,
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