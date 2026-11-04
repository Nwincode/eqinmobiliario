# Formato del inventario de propiedades (para Cowork u otra herramienta)

Objetivo: armar el inventario **sin escribir en la base de datos**. El resultado es una hoja
(CSV / Excel) que se revisa a mano y luego se carga desde el panel (Propiedades → Nueva).

## Reglas para no contaminar la base de datos
1. **Solo lectura.** No crear, cambiar ni borrar nada en Firebase (`eqinmobiliariobd`). Nunca tocar el proyecto "ptg".
2. **Una fila por propiedad.** Antes de agregar una, buscar si ya existe (misma dirección/residencial + zona + tipo). Si existe, se marca en la columna `accion` como `actualizar` con su `id`; si no, `nueva`.
3. **Ignorar las de prueba:** todo lo que tenga `demo = true` o un id que empiece con `prueba-`.
4. **Valores exactos** en las columnas con lista cerrada (abajo). Nada de "Casa grande", "venta/renta", "$", "aprox.".
5. **Números sin símbolos:** `1291000`, no `$1,291,000`. Si no se sabe un dato, dejar la celda **vacía** (no 0, no "N/D").
6. **Sin datos privados en columnas públicas:** el nombre, teléfono y comisión del dueño van solo en las columnas `propietario_*`, nunca en la descripción.
7. **Sin nombres de bancos ni de otras empresas** en título o descripción.
8. Todo entra como `publicado = no`. Se publica a mano desde el panel después de revisar.
9. Fotos: solo enlaces o nombres de archivo; se suben desde el panel (máx. 10 MB cada una).

10. **No hace falta conectarse a Firebase.** Para saber qué propiedades ya existen se usa la lista de abajo
    ("Propiedades que ya están en el sitio"). Si una no se puede comprobar, `accion = revisar` y se explica en `notas`.

## De dónde sale la información (Google Drive)
- **"1. Propiedades"**: carpetas por zona (Ciudad Capital y sus zonas, Mixco, Villa Nueva, etc.). Son propiedades del equipo.
- **"10. Corredores asociados"**: carpetas de agencias/corredores aliados. Toda propiedad de aquí lleva el nombre
  de la agencia en `aliada`, y en `asesor` el asesor del equipo que la atiende (si no se sabe, `accion = revisar`).
- Las fotos **no se copian ni se suben**: en `fotos` van los enlaces de Drive separados por `;`.
- En `notas` se escribe siempre la carpeta de Drive de donde salió la fila y lo que haya que confirmar.

## Propiedades que ya están en el sitio
Si se encuentra una de estas, `accion = actualizar` con este `id`. Actualizar esta lista cuando se carguen más en el panel.

| id | título | tipo | operación | zona |
|---|---|---|---|---|
| residencial-san-antonio | Casa en Residencial San Antonio | casa | venta | Zona 16 |
| jardines-de-mirabel | Casa en Residencial Jardines de Mirabel | casa | venta | Zona 16 |

## Columnas

| Columna | Obligatoria | Valores permitidos / ejemplo |
|---|---|---|
| accion | sí | `nueva` · `actualizar` · `revisar` (si hay duda de duplicado) |
| id | solo si `actualizar` | id actual en el panel, ej. `residencial-san-antonio` |
| titulo | sí | `Casa en Residencial San Antonio` |
| operacion | sí | `venta` · `renta` |
| tipo | sí | `casa` · `apartamento` · `terreno` · `oficina` · `local` · `bodega` · `finca` |
| estado | sí | `disponible` · `proximamente` · `reservada` · `vendida` · `rentada` · `pausada` · `retirada` (ver «Estados» abajo). Vacío = `disponible` |
| precio | sí | número entero, ej. `1291000` |
| moneda | sí | `USD` · `GTQ` |
| zona | sí | `Zona 16` (así: "Zona" + número) o nombre del municipio |
| ciudad | sí | `Guatemala`, `Mixco`, `Santa Catarina Pinula`… |
| direccion | no | residencial / colonia, sin número de casa |
| habitaciones | no | número |
| banos | no | número (medio baño = `0.5`) |
| parqueos | no | número |
| m2Construccion | no | número en m² |
| m2Terreno | no | número en m² (si viene en varas², multiplicar por 0.6987) |
| amenidades | no | separadas por `;` ej. `Piscina; Garita; Jardín` |
| descripcion | sí | 2–5 frases, español |
| asesor | sí | id de un asesor del panel (Asesores), ej. `joaquin-arriola`. Si el asesor aún no está en el panel, escribir su nombre y marcar `accion = revisar` |
| aliada | no | nombre de la agencia aliada si la propiedad es de una aliada (no se publica). En ese caso `asesor` = el asesor del equipo que la atiende |
| destacada | no | `si` · `no` |
| fotos | no | enlaces de Drive separados por `;` |
| propietario_nombre | no | solo para el CRM |
| propietario_telefono | no | `+502 5555 5555` |
| exclusiva_hasta | no | fecha `AAAA-MM-DD` |
| comision_pct | no | número, ej. `5` |
| notas | no | lo que haya que verificar |

## Estados

| estado | En el panel | Qué pasa en la página |
|---|---|---|
| `disponible` | Disponible | Se ve en portada, listados, buscador, destacadas, sitemap y catálogos. |
| `proximamente` | Próximamente | Se ve en todo el sitio con la etiqueta «Próximamente» (Coming soon). Para pre-lanzamientos. |
| `reservada` | Reservada / con oferta | Se ve en todo el sitio con la etiqueta «Reservada» (Under contract). Tiene oferta, arras o promesa firmada. |
| `vendida` | Vendida | Sale de portada, listados, buscador, destacadas, sitemap y catálogos. Su enlace sigue abriendo con el aviso «Vendida», un botón para escribir por WhatsApp y propiedades parecidas. |
| `rentada` | Rentada | Igual que `vendida`, con el aviso «Rentada». |
| `pausada` | Pausada | No aparece en ningún lado. Su enlace muestra «Ya no está disponible» (sin fotos ni datos) con propiedades parecidas, y Google no la indexa. Para pausas temporales pedidas por el dueño. |
| `retirada` | Retirada del mercado | Igual que `pausada`. El dueño ya no vende o renta, la vendió por su cuenta o venció la exclusiva. |

Aparte del estado, el interruptor «Visible en la página» del panel (campo `publicado`) apagado oculta la propiedad por completo, como un borrador.
Cada cambio de estado guarda la fecha (`estadoFecha`) y queda en el historial de la propiedad (`historialEstado`: estado, fecha y quién lo cambió).

Plantilla lista: `docs/plantilla-inventario-propiedades.csv`.
