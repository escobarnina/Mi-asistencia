// Lectura de archivos Excel (.xlsx) para las importaciones (RF-11, RF-12).
// Convierte la primera hoja en una lista de objetos { fila, ...campos },
// usando la primera fila como encabezados.
const ExcelJS = require('exceljs');
const { errorHttp } = require('../core/errors');

const MAX_FILAS = 5000;

// "Correo Electrónico " -> "correo electronico" (sin tildes, minúsculas,
// espacios simples) para comparar encabezados sin importar cómo se escriban.
function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Devuelve el valor "útil" de una celda. Excel puede guardar texto, números,
// fechas, enlaces (los correos suelen convertirse en enlaces), texto con
// formato o fórmulas; aquí se reduce todo a string, number o Date.
function valorCelda(celda) {
  const v = celda.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((p) => p.text).join('');
    if (v.text !== undefined) return valorCelda({ value: v.text });
    if (v.result !== undefined) return valorCelda({ value: v.result });
    if (v.error) return null;
    return null;
  }
  return v;
}

// columnas: { campo: ['encabezado aceptado', 'otro nombre', ...] }
// Lanza 400 si el archivo no es un .xlsx válido o le falta alguna columna.
async function leerFilas(buffer, columnas) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch (e) {
    throw errorHttp(400, 'El archivo no es un Excel válido (.xlsx)');
  }

  const hoja = libro.worksheets[0];
  if (!hoja || hoja.rowCount < 2) {
    throw errorHttp(400, 'El archivo está vacío o no tiene filas de datos');
  }

  // Ubicar en qué número de columna está cada campo según el encabezado.
  const encabezados = {};
  hoja.getRow(1).eachCell((celda, numCol) => {
    const texto = valorCelda(celda);
    if (texto !== null) encabezados[normalizar(texto)] = numCol;
  });

  const posicion = {};
  const faltantes = [];
  for (const [campo, nombres] of Object.entries(columnas)) {
    const encontrado = nombres.map(normalizar).find((n) => encabezados[n]);
    if (encontrado) {
      posicion[campo] = encabezados[encontrado];
    } else {
      faltantes.push(nombres[0]);
    }
  }
  if (faltantes.length > 0) {
    throw errorHttp(
      400,
      `Faltan columnas en el archivo: ${faltantes.join(', ')}`
    );
  }

  // Leer las filas de datos (desde la 2), saltando las totalmente vacías.
  const filas = [];
  for (let numFila = 2; numFila <= hoja.rowCount; numFila++) {
    const row = hoja.getRow(numFila);
    const datos = { fila: numFila };
    let vacia = true;
    for (const [campo, numCol] of Object.entries(posicion)) {
      let valor = valorCelda(row.getCell(numCol));
      if (typeof valor === 'string') valor = valor.trim();
      if (valor === '') valor = null;
      if (valor !== null) vacia = false;
      datos[campo] = valor;
    }
    if (!vacia) filas.push(datos);
  }

  if (filas.length === 0) {
    throw errorHttp(400, 'El archivo no tiene filas de datos');
  }
  if (filas.length > MAX_FILAS) {
    throw errorHttp(400, `El archivo supera el máximo de ${MAX_FILAS} filas`);
  }
  return filas;
}

module.exports = { leerFilas, normalizar };
