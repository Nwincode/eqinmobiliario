// Importar primero (antes que cualquier función de netlify/functions): activa el cargador de esta carpeta.
import { register } from 'node:module';
register('./cargador.mjs', import.meta.url);
