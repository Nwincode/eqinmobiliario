// Lo que se le dice al equipo cuando el panel nuevo ya está publicado y las reglas de la base todavía son las de antes
// (docs/portal-propietarios.md: el sitio se publica primero y las reglas en seguida). Solo lo usan los guardados que las
// reglas de antes no conocen (número seguido de cotizaciones, renglón de los datos de pago): no se guardan a la manera de
// antes, se explica qué falta.
export const SIN_REGLAS_NUEVAS = 'No se guardó: falta publicar las reglas nuevas de la base (Firebase → Firestore → Reglas). Avísale al administrador y vuelve a guardar después.';
