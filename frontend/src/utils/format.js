import { useEffect } from 'react';

export function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

// '2026-10-05' -> '05/10/2026'; '18:00:00' -> '18:00'
export const fechaLegible = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const horaLegible = (h) => (h ? h.slice(0, 5) : '');
// '2026-10-05' -> '05/10'
export const diaMes = (iso) => fechaLegible(iso).slice(0, 5);

const TZ = 'America/La_Paz';

export const hoyLaPaz = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );

// Hora (24 h) de una marca guardada como fecha completa del servidor.
export const horaMarca = (iso) =>
  new Intl.DateTimeFormat('es-BO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso)
  );

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-BO', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// dd/mm/aaaa HH:MM
export function fechaHoraLegible(iso) {
  if (!iso) return '-';
  return FORMATO_FECHA_HORA.format(new Date(iso)).replace(',', '');
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function partes(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return { a, m, d, dia: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
}

// 'Jueves, 15 de octubre de 2026'
export function fechaLarga(iso) {
  const { a, m, d, dia } = partes(iso);
  return `${mayus(DIAS[dia])}, ${d} de ${MESES[m - 1]} de ${a}`;
}

// 'jue 15/10'
export function diaCorto(iso) {
  const { dia } = partes(iso);
  return `${DIAS[dia].slice(0, 3)} ${diaMes(iso)}`;
}

// 'jueves 15/10'
export function diaNombre(iso) {
  const { dia } = partes(iso);
  return `${DIAS[dia]} ${diaMes(iso)}`;
}

export function iniciales(nombre = '') {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  return (p[0][0] + (p.length > 1 ? p[1][0] : '')).toUpperCase();
}

// Título de la pestaña: "MiAsistencia · {página}".
export function usePageTitle(pagina) {
  useEffect(() => {
    document.title = pagina ? `MiAsistencia · ${pagina}` : 'MiAsistencia';
  }, [pagina]);
}

// Porcentaje de asistencia: presentes ÷ (presentes + faltas); null si no hay base.
export function porcentaje(presentes, faltas) {
  const base = presentes + faltas;
  return base === 0 ? null : Math.round((presentes / base) * 100);
}
