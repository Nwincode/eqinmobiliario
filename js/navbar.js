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

				var newElSpan = document.createElement('span');
				newElSpan.setAttribute('class', 'arrow-collapse collapsed');

				// prepend equivalent to jquery
				hasChild.insertBefore(newElSpan, refEl);

				var arrowCollapse = hasChild.querySelector('.arrow-collapse');
				arrowCollapse.setAttribute('data-bs-toggle', 'collapse');
				arrowCollapse.setAttribute('data-bs-target', '#collapseItem' + counter);

				var dropdown = hasChild.querySelector('.dropdown');
				dropdown.setAttribute('class', 'collapse');
				dropdown.setAttribute('id', 'collapseItem' + counter);

				counter++;
			});

		}, 1000);


		// Click js-menu-toggle

		var menuToggle = document.querySelectorAll(".js-menu-toggle");
		var mTog;
		menuToggle.forEach(mtoggle => {
			mTog = mtoggle;
			mtoggle.setAttribute('aria-expanded', 'false');
			mtoggle.addEventListener("click", (e) => {
				e.preventDefault();
				var abrir = !document.body.classList.contains('offcanvas-menu');
				document.body.classList.toggle('offcanvas-menu', abrir);
				menuToggle.forEach(function (t) {
					t.classList.toggle('active', abrir);
					t.setAttribute('aria-expanded', abrir ? 'true' : 'false');
				});
			});
		})

		// Escape cierra el menú y devuelve el foco al botón.
		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Escape' || !document.body.classList.contains('offcanvas-menu')) return;
			document.body.classList.remove('offcanvas-menu');
			menuToggle.forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-expanded', 'false'); });
			var burger = document.querySelector('.burger.js-menu-toggle');
			if (burger) burger.focus();
		});



		var specifiedElement = document.querySelector(".site-mobile-menu");
		var mt, mtoggleTemp;
		document.addEventListener('click', function(event) {
			var isClickInside = specifiedElement.contains(event.target);
			menuToggle.forEach(mtoggle => {
				mtoggleTemp = mtoggle
				mt = mtoggle.contains(event.target);
			})

			if (!isClickInside && !mt) {
				if ( document.body.classList.contains('offcanvas-menu') ) {
					document.body.classList.remove('offcanvas-menu');
					menuToggle.forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-expanded', 'false'); });
				}
			}

		});

	}; 
	siteMenuClone();


})()