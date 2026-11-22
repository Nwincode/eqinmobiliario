# Propuestas de herramientas nuevas (21 nov 2026)

Salen de las deficiencias que encontraron las simulaciones y las cacerías de errores. Ninguna se programa sin el sí
del usuario. Orden: lo que más protege primero.

| # | Herramienta | Deficiencia que cubre | Qué hace |
|---|---|---|---|
| 1 | Respaldo diario y guía para restaurar | La base no tiene respaldos | Copia diaria de Firestore y recuperación a un punto en el tiempo (la activa el usuario en la consola); guía de 1 página para volver atrás |
| 2 | Pantalla «Estado del sistema» en el panel | Los fallos solo quedan en el registro de Netlify: correos pendientes, publicación frenada, calendarios de Airbnb caídos, purga del CDN, relojes automáticos | Una tarjeta en Inicio con lo que falló y desde cuándo, y un correo diario si algo sigue roto |
| 3 | Bitácora de cambios sensibles | No queda rastro de quién cambió una cuenta de cobro, un precio, un margen o tocó «Revisé Airbnb» | Cada cambio de dinero o datos de cobro guarda quién, cuándo, antes y después; se ve en la ficha |
| 4 | Pruebas del emulador en GitHub | Las pruebas de reglas y el recorrido solo corren en local; un cambio puede romperlos sin que nadie lo vea | Cada PR corre `test:reglas` y el recorrido; no se une con una en rojo |
| 5 | Monitoreo SEO semanal | No hay acceso a Search Console desde aquí | Informe privado del sitio con cada página: indexada o no, 404, búsquedas; Claude lo lee y arregla |
| 6 | Verificación anti-robots en formularios | Cualquiera puede crear solicitudes y chats sin límite | Turnstile (gratis, sin captcha molesto) y tope por persona |
| 7 | Revisión de comprobantes | Un comprobante falso pasa: nadie revisa monto ni fecha | Lee el monto, la fecha y el banco de la foto y avisa si no cuadra con la reserva |
| 8 | Rebotes de correo | Si el correo del cliente no existe, nadie se entera | Aviso en la solicitud: «El correo no llegó», con WhatsApp como salida |
| 9 | Estado de cuenta mensual del socio | La comisión se revisa a mano | El día 1 le llega al socio su resumen: reservas, comisión, pagado y pendiente |
| 10 | Verificación en dos pasos para administradores | Una contraseña robada da acceso a todo el dinero | Código de una app al entrar (tarea #23) |
