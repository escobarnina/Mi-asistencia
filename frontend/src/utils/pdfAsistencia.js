import { formatInTimeZone } from 'date-fns-tz';
import { fechaLegible, horaLegible, nombreDia, porcentaje } from './format';

const TZ = 'America/La_Paz';

const TEXTO_ESTADO = { PRESENTE: 'Presente', FALTA: 'Falta', PENDIENTE: 'Pendiente', PROXIMA: 'Próxima' };
// Mismos colores de estado que el resto del sistema (theme.css).
const COLOR_ESTADO = {
  PRESENTE: [21, 128, 61],
  FALTA: [185, 28, 28],
  PENDIENTE: [180, 83, 9],
  PROXIMA: [71, 85, 105],
};

// 'Módulo 1' -> 'Modulo_1' para el nombre del archivo.
const paraArchivo = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Reporte personal de asistencia. Los estados vienen tal cual de la API (no se recalculan).
export async function exportarPdfAsistencia({ usuario, historial }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { modulo, fechas, resumen } = historial;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Reporte de asistencia', 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Estudiante: ${usuario.nombre}`, 40, 72);
  doc.text(`Registro: ${usuario.codigo || '-'}`, 40, 86);
  doc.text(`Módulo: ${modulo.nombre}${modulo.gestion ? ` (${modulo.gestion})` : ''}`, 40, 100);
  doc.text(`Generado: ${formatInTimeZone(new Date(), TZ, 'dd/MM/yyyy HH:mm')}`, 40, 114);

  autoTable(doc, {
    startY: 130,
    head: [['Fecha', 'Día', 'Horario', 'Estado', 'Hora de marca']],
    body: fechas.map((f) => [
      fechaLegible(f.fecha),
      nombreDia(f.fecha),
      `${horaLegible(f.hora_inicio)} - ${horaLegible(f.hora_fin)}`,
      TEXTO_ESTADO[f.estado] || f.estado,
      f.hora_registro ? formatInTimeZone(new Date(f.hora_registro), TZ, 'HH:mm') : '-',
    ]),
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [37, 87, 214] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const estado = fechas[data.row.index].estado;
        data.cell.styles.textColor = COLOR_ESTADO[estado] || [15, 23, 42];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const dictadas = resumen.presentes + resumen.faltas;
  const pct = porcentaje(resumen.presentes, resumen.faltas);
  let y = doc.lastAutoTable.finalY + 28;
  if (y > 770) {
    doc.addPage();
    y = 50;
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Totales', 40, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Clases dictadas: ${dictadas}   Presentes: ${resumen.presentes}   Faltas: ${resumen.faltas}   ` +
      `Asistencia: ${pct === null ? '-' : `${pct}%`}`,
    40,
    y + 16
  );
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('El porcentaje solo cuenta clases ya dictadas (presentes / dictadas).', 40, y + 32);

  doc.save(`asistencia_${paraArchivo(usuario.codigo || 'estudiante')}_${paraArchivo(modulo.nombre)}.pdf`);
}
