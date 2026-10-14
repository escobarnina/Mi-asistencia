// Genera docs/ejemplos/estudiantes.xlsx y fechas.xlsx con el formato del PDF de requisitos.
// Uso (desde backend/, donde está exceljs):  node ../docs/ejemplos/generar.js
const path = require('path');
const ExcelJS = require(path.resolve(__dirname, '../../backend/node_modules/exceljs'));

async function crear(nombre, filas, anchos) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Hoja1');
  filas.forEach((f) => hoja.addRow(f));
  hoja.getRow(1).font = { bold: true };
  hoja.columns.forEach((col, i) => { col.width = anchos[i]; });
  await libro.xlsx.writeFile(path.join(__dirname, nombre));
}

(async () => {
  await crear(
    'estudiantes.xlsx',
    [
      ['Número de registro', 'Nombre completo', 'Correo electrónico'],
      ['1001', 'Juan Pérez', 'juan@gmail.com'],
      ['1002', 'María López', 'maria@gmail.com'],
      ['1003', 'Carlos Mamani', 'carlos@gmail.com'],
      ['1004', 'Lucía Quispe', 'lucia@gmail.com'],
    ],
    [20, 28, 30]
  );
  await crear(
    'fechas.xlsx',
    [
      ['Fecha', 'Hora inicio', 'Hora fin'],
      ['05/10/2026', '18:00', '21:00'],
      ['07/10/2026', '18:00', '21:00'],
      ['12/10/2026', '18:00', '21:00'],
    ],
    [14, 14, 14]
  );
  console.log('Ejemplos generados en docs/ejemplos/');
})();
