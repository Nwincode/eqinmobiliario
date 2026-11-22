# Pasos del dueño para las herramientas nuevas

Lo que solo el dueño puede hacer (consolas de Firebase, Netlify y ZeptoMail). Claude no tiene acceso.

## Reglas de la base (bitácora, estado del sistema, comprobantes)

Al unir estos cambios, publicar `firestore.rules` en Firebase → Firestore → Reglas. Mientras sigan las de antes, el
panel guarda como antes (sin bitácora): lo sabe preguntando por `reglas/r6`.

## Rebotes de correo (ZeptoMail)

1. En Netlify → Variables de entorno, crear `REBOTE_CORREO_LLAVE` con un texto al azar de 32 letras o más.
2. En ZeptoMail → el Mail Agent → Webhooks → Agregar: dirección
   `https://eqinmobiliario.gt/api/rebote-correo?llave=` seguida de esa llave; eventos: rebote duro y rebote suave.
3. Usar «Probar» de ZeptoMail: el registro de la función dice «ok». (La forma del aviso no se pudo leer de la
   documentación de ZeptoMail desde aquí: si en la prueba no se marca nada, mandar a Claude el ejemplo que muestra ZeptoMail.)

Un correo de cliente que rebota sale en Solicitudes y en Leads: «El correo no llegó», con el WhatsApp al lado. Uno de un
dueño o del equipo sale en Inicio → Estado del sistema.

## Revisión de comprobantes con la IA

Usa la misma `ANTHROPIC_API_KEY` de Netlify que ya tiene el Asistente. Sin ella, no se revisa nada y Solicitudes no
muestra el aviso. Cada foto se manda una vez (a lo más 3 por reserva).

## Estado de cuenta mensual del socio

Corre solo los días 1, 2 y 3 (7:40 a. m.). No hay nada que activar: usa el correo de la ficha de cada socio.
