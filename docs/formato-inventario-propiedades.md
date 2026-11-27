# Formato del inventario de propiedades (para Cowork u otra herramienta)

Objetivo: armar el inventario **sin escribir en la base de datos**. El resultado es una hoja (CSV) con una carpeta
de fotos por propiedad (en un .zip), que se revisa a mano y se carga en el panel: **Propiedades → Importar**. Las
columnas son las del importador (`admin/js/importar.js` `PLANTILLA`); la plantilla lista sale de ahí mismo:
`docs/plantilla-inventario-propiedades.csv` (venta y renta) y `docs/plantilla-casas-por-noche.csv` (por noche). El
importador también la descarga («Plantilla»).

## Reglas para no contaminar la base de datos
1. **Solo lectura.** No crear, cambiar ni borrar nada en Firebase (`eqinmobiliariobd`). Nunca tocar el proyecto "ptg".
2. **Una fila por propiedad.** Una que ya existe se actualiza con su `codigo` (el que muestra el panel); sin código, es nueva.
3. **Valores exactos** en las columnas con lista cerrada (abajo). Nada de "Casa grande", "venta/renta", "$", "aprox.".
4. **Números sin símbolos:** `1291000`, no `$1,291,000`. Si no se sabe un dato, dejar la celda **vacía** (no 0, no "N/D").
5. **Nada privado en lo que se publica.** Título, descripción, zona, ciudad y dirección salen en la página y en Google:
   - sin nombre ni teléfono del dueño o del colaborador (van solo en `propietario`);
   - sin el nombre del residencial ni la dirección exacta si el cliente podría ir directo: `direccion` vacía;
   - sin nombres de bancos ni de otras empresas.
6. **Fotos:** una carpeta por propiedad con el nombre de la columna `carpeta` (`casa-vista-lomas/1.jpg, 2.jpg…`),
   todas en un .zip. La primera es la portada. Al menos 800 px en su lado mayor (una vertical de 720 × 1280 sirve), hasta 10 MB cada una.
7. Todo entra sin publicar. Se publica a mano desde el panel después de revisar.

## Quién es quién
- `propietario`: el dueño, socio o **asesor colaborador** que nos pasó el inmueble. Tiene que existir antes su ficha
  en Propietarios (el importador no la crea); se escribe su nombre, teléfono o correo. Si nos la pasó un colaborador
  y no conocemos al dueño, va el colaborador.
- `asesor`: el asesor **de EQ** que la atiende (nombre como sale en Usuarios). Vacío si aún no tiene. Un colaborador
  de otra empresa nunca va aquí: el importador diría «Asesor no encontrado».

## Columnas
| Columna | Obligatoria | Valores permitidos / ejemplo |
|---|---|---|
| codigo | solo para actualizar | el código del panel; vacío en una nueva (se crea solo) |
| carpeta | sí, si hay fotos | nombre de su carpeta de fotos en el .zip, ej. `casa-vista-lomas` |
| titulo | sí | `Casa con jardín en Vista de las Lomas` |
| operacion | sí | `venta` · `renta` · `vacacional` (por noche) |
| tipo | sí | `casa` · `apartamento` · `terreno` · `oficina` · `local` · `bodega` · `finca` |
| estado | no | `disponible` · `proximamente` · `reservada` · `vendida` · `rentada` · `pausada` · `retirada` (ver «Estados»). Vacío = `disponible` |
| asesor | no | asesor de EQ (ver «Quién es quién») |
| propietario | por noche, sí | nombre, teléfono (`+502 5555 5555`) o correo de una ficha que **ya existe** en Propietarios |
| precio | sí (venta y renta) | número, ej. `350000`; vacío = «Precio a consultar» |
| moneda | sí | `USD` · `GTQ` |
| zona | sí | `Zona 16` en la capital (y municipios con zonas); fuera de ella, el municipio: `San Miguel Dueñas` |
| ciudad | sí | el municipio: `Guatemala`, `Mixco`, `San Miguel Dueñas`… |
| direccion | no | mejor vacía (se publica; ver regla 5) |
| condominio_siglas | no | siglas del residencial para el código, ej. `VLM`; vacío = se toman del residencial o `IND` |
| habitaciones · banos · parqueos | no | números (medio baño = `0.5`) |
| m2_construccion · m2_terreno | no | números en m² (varas² × 0.6987) |
| niveles · anio_construccion · mantenimiento | no | números; mantenimiento al mes, en la moneda del precio |
| amenidades | no | separadas por `;` ej. `Piscina; Garita de seguridad; Jardín` |
| descripcion | sí | 2–5 párrafos en español; se traduce sola al inglés |
| video | no | enlace de YouTube o Vimeo |
| socio_noche · socio_finde · margen · limpieza · deposito · noches_min · huespedes_max · ical_airbnb · ical_booking · ical_vrbo | solo por noche | ver `docs/plantilla-casas-por-noche.csv` |

La landing VIP no va en el CSV: se marca en la ficha de la casa después de importar.

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

