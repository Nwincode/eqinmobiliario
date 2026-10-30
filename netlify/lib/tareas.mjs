// Tareas de IA: instrucciones, esquema de la respuesta y nivel de razonamiento de cada una.

const SISTEMA = `Eres el asistente de IA de Equipo Inmobiliario S.A., una inmobiliaria en Guatemala.
Trabajas para los asesores (corredores): les ahorras el trabajo repetitivo y les ayudas a atender mejor a sus clientes.

Reglas:
- Escribe en español de Guatemala, con tono profesional, cercano y breve. Trata al cliente de "usted" salvo que el asesor indique otra cosa.
- Usa solo las propiedades del inventario que se te entrega. Nunca inventes propiedades, precios, medidas ni características.
- Si un dato no está en el inventario, dilo o pregúntalo; no lo supongas.
- Los precios pueden estar en US$ o en quetzales (Q). Al comparar presupuestos usa 1 US$ ≈ 7.7 Q y menciónalo si lo aplicas.
- Los mensajes de WhatsApp deben ser cortos (máximo 6 líneas), sin markdown, con a lo sumo 1 emoji, y terminar con una pregunta que invite a responder.
- Cuando incluyas una propiedad en un mensaje al cliente, agrega su enlace (campo "url").`;

const str = (description) => ({ type: 'string', description });
const strArr = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const TAREAS = {
	// Búsqueda por requerimiento: el asesor describe lo que pide un cliente.
	buscar: {
		effort: 'medium',
		staff: true,
		instrucciones: `El asesor te pega el requerimiento de un cliente (puede ser un mensaje de WhatsApp tal cual).
1. Extrae los criterios.
2. Evalúa cada propiedad del inventario contra esos criterios y devuelve solo las que valga la pena ofrecer (máximo 8), de la más a la menos adecuada. Puntaje 0-100.
3. En "diferencias" anota con honestidad en qué no cumple (p. ej. "excede el presupuesto en US$ 20,000").
4. Si faltan datos importantes para afinar la búsqueda, propón preguntas para el cliente.
5. Redacta un mensaje de WhatsApp para el cliente con las 2 o 3 mejores opciones y sus enlaces. Si no hay ninguna adecuada, el mensaje debe decir que se le buscarán opciones y pedir los datos faltantes.`,
		schema: obj({
			criterios: obj({
				resumen: str('Resumen en una línea de lo que busca el cliente'),
				operacion: { type: 'string', enum: ['venta', 'renta', 'cualquiera'] },
				tipos: strArr('Tipos de inmueble: casa, apartamento, terreno, oficina, local, bodega, finca'),
				zonas: strArr('Zonas o ubicaciones aceptables'),
				presupuestoMaximo: { type: 'number', description: 'En la moneda indicada; 0 si no se indicó' },
				moneda: { type: 'string', enum: ['USD', 'GTQ'] },
				habitacionesMinimas: { type: 'integer', description: '0 si no se indicó' },
				otros: strArr('Otros requisitos: parqueos, jardín, mascotas, amueblado, etc.')
			}),
			resultados: {
				type: 'array',
				items: obj({ id: str('id de la propiedad del inventario'), puntaje: { type: 'integer' }, motivo: str('Por qué encaja'), diferencias: str('En qué no cumple; vacío si cumple todo') })
			},
			preguntas: strArr('Preguntas para afinar el requerimiento'),
			mensajeCliente: str('Mensaje de WhatsApp para el cliente')
		})
	},

	// Seguimiento de un lead: qué hacer ahora y qué escribirle.
	seguimiento: {
		effort: 'low',
		staff: true,
		instrucciones: `Te paso un lead (cliente potencial) con su historial de notas y, si aplica, la propiedad que le interesó, además del inventario.
Clasifica qué tan cerca está de cerrar, propone el siguiente paso concreto y redacta los mensajes para contactarlo.
Si el lead preguntó por una propiedad que ya no está disponible o hay otras que le pueden interesar, sugiere hasta 3 del inventario.`,
		schema: obj({
			resumen: str('Resumen del caso en 2 líneas'),
			temperatura: { type: 'string', enum: ['caliente', 'tibio', 'frio'] },
			siguientePaso: str('Acción concreta y cuándo hacerla'),
			mensajeWhatsApp: str('Mensaje de WhatsApp listo para enviar'),
			correoAsunto: str('Asunto del correo'),
			correoCuerpo: str('Cuerpo del correo, texto plano'),
			propiedadesSugeridas: { type: 'array', items: obj({ id: str('id del inventario'), motivo: str('Por qué se la sugieres') }) }
		})
	},

	// Redacción de la ficha: descripción, SEO, landing VIP y publicaciones para redes.
	descripcion: {
		effort: 'medium',
		staff: true,
		instrucciones: `Te paso los datos de una propiedad y notas del asesor. Escribe el material de venta:
- Una descripción atractiva y verídica de 150 a 250 palabras en markdown simple (párrafos y, si conviene, una lista). Destaca ubicación, espacios y estilo de vida. Sin exageraciones ni datos inventados.
- Un título de anuncio claro (máx. 70 caracteres) que incluya el tipo de inmueble y la zona.
- Título y descripción para Google (máx. 65 y 155 caracteres) pensados en lo que la gente busca, p. ej. "casa en venta zona 16".
- Titular y subtítulo para una landing VIP, y de 4 a 6 puntos clave cortos.
- Una publicación para Instagram (con 5 a 8 hashtags locales) y una para Facebook.
- Lista de amenidades que se mencionan en los datos o notas.`,
		schema: obj({
			titulo: str('Título del anuncio'),
			descripcion: str('Descripción en markdown simple'),
			seoTitulo: str('Título para Google'),
			seoDescripcion: str('Descripción para Google'),
			vipTitular: str('Titular para la landing VIP'),
			vipSubtitular: str('Subtítulo para la landing VIP'),
			puntosClave: strArr('Puntos clave cortos'),
			amenidades: strArr('Amenidades mencionadas'),
			postInstagram: str('Publicación para Instagram'),
			postFacebook: str('Publicación para Facebook')
		})
	},

	// Clientes que buscan algo parecido a una propiedad (al captar o publicar una nueva).
	coincidencias: {
		effort: 'low',
		staff: true,
		instrucciones: `Te paso una propiedad y la lista de requerimientos activos de clientes.
Devuelve los requerimientos a los que vale la pena ofrecerles esta propiedad (puntaje 0-100, máximo 10), con un mensaje de WhatsApp personalizado para cada cliente que incluya el enlace de la propiedad.`,
		schema: obj({
			coincidencias: {
				type: 'array',
				items: obj({ id: str('id del requerimiento'), puntaje: { type: 'integer' }, motivo: str('Por qué le puede interesar'), mensajeWhatsApp: str('Mensaje para el cliente') })
			}
		})
	},

	// Asistente libre para el día a día del asesor.
	chat: {
		effort: 'medium',
		staff: true,
		instrucciones: `Conversa con el asesor y ayúdale con su trabajo diario: redactar mensajes y correos, preparar visitas, responder objeciones, comparar propiedades del inventario, calcular cuotas o comisiones, organizar su semana, etc.
Responde en markdown breve. Si te pide algo que requiere datos que no tienes, dilo.`,
		schema: null
	},

	// Buscador del sitio público: convierte una frase en filtros. Sin inicio de sesión.
	busquedaPublica: {
		effort: 'low',
		staff: false,
		instrucciones: `Un visitante del sitio describe lo que busca. Conviértelo en filtros del buscador.
Usa solo valores de las listas de zonas y tipos disponibles; si no aplica, deja el campo vacío o en 0.
"texto" son palabras clave que no encajan en los demás filtros (p. ej. el nombre de un residencial).`,
		schema: obj({
			operacion: { type: 'string', enum: ['', 'venta', 'renta'] },
			tipo: str('Uno de los tipos disponibles o vacío'),
			zona: str('Una de las zonas disponibles o vacío'),
			habitaciones: { type: 'integer', description: 'Mínimo de habitaciones, 0 si no se indicó' },
			precioMaximo: { type: 'number', description: '0 si no se indicó' },
			texto: str('Palabras clave restantes'),
			respuesta: str('Una frase amable confirmando lo que se buscará')
		})
	}
};

export { SISTEMA };
