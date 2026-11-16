// Primer script del panel (clásico, en <head>, antes que todo): si se llegó con el enlace de un correo de Firebase
// (/admin/#mode=…&oobCode=… o, el de Firebase mismo, /admin/?mode=…&oobCode=…), guarda la acción en memoria y la borra
// de la barra en el acto: el código de un solo uso no queda en el historial, ni en una captura, ni en registros.
(function () {
	var hash = location.hash.charAt(1) === '/' ? '' : location.hash.slice(1);
	var p = new URLSearchParams(hash || location.search);
	var codigo = p.get('oobCode');
	if (!codigo) return;
	window.__enlace = { modo: p.get('mode') || '', codigo: codigo };
	history.replaceState(null, '', location.pathname);
})();
