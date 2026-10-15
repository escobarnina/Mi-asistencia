import client from './client';
import { hoyLaPaz } from '../utils/format';

// Descarga el Excel de asistencias con los mismos filtros de la consulta.
export async function descargarAsistencias({ fecha, estudiante } = {}) {
  const res = await client.get('/admin/asistencias/exportar', {
    params: { fecha: fecha || undefined, estudiante: estudiante?.trim() || undefined },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `asistencias-${fecha || hoyLaPaz()}.xlsx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
