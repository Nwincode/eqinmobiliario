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

Un correo de cliente que rebota sale en Solicitudes y en Interesados: «El correo no llegó», con el WhatsApp al lado. Uno de un
dueño o del equipo sale en Inicio → Estado del sistema.

## Revisión de comprobantes con la IA

Usa la misma `ANTHROPIC_API_KEY` de Netlify que ya tiene el Asistente. Sin ella, no se revisa nada y Solicitudes no
muestra el aviso. Cada foto se manda una vez (a lo más 3 por reserva).

## Estado de cuenta mensual del socio

Corre solo los días 1, 2 y 3 (7:40 a. m.). No hay nada que activar: usa el correo de la ficha de cada socio.

## Verificación en dos pasos de los administradores

Mientras no esté activada, el administrador entra como siempre y en Inicio ve «Falta encender la verificación en dos pasos
en Firebase», con el enlace a la consola del proyecto. Ya activada, quien no tiene su teléfono inscrito lo inscribe al
entrar con su contraseña; si recarga esa pantalla o tiene otra pestaña, entra igual y cada pantalla le dice «Activa la
verificación en dos pasos» con el botón «Activar», hasta inscribirlo.
Los pasos (de la documentación de Firebase que se conoce; no se pudo abrir desde aquí para confirmarlos: sin comprobar):

1. Firebase → Authentication → Configuración: pasar a **Identity Platform** (gratis hasta su cuota).
2. Activar TOTP en el proyecto `eqinmobiliariobd`. Firebase lo activa por su API (no por un botón de la consola), p. ej.
   con Cloud Shell:
   `curl -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" -H "X-Goog-User-Project: eqinmobiliariobd" "https://identitytoolkit.googleapis.com/admin/v2/projects/eqinmobiliariobd/config?updateMask=mfa" -d '{"mfa":{"state":"ENABLED","providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":1}}]}}'`
3. Al volver a entrar, cada administrador inscribe su teléfono (QR y código). Firebase pide el correo confirmado: si no
   lo está, el panel manda el correo para confirmarlo.

**Si un administrador pierde el teléfono:** otro administrador le quita el segundo paso en Firebase → Authentication →
Usuarios → la cuenta → «Multifactor» (o con la API de administración). Si es el único administrador, lo hace el dueño de
la cuenta de Google del proyecto. Por eso conviene tener **dos administradores** con el segundo paso activo.
