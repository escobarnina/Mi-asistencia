import { useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, format, getISODay, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { Button, Card, EmptyState, Skeleton, StatusBadge } from '../../components/ui';
import { exportarPdfAsistencia } from '../../utils/pdfAsistencia';
import { fechaLarga, horaLegible, mensajeDe, porcentaje, usePageTitle } from '../../utils/format';

const TZ = 'America/La_Paz';
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CLASE_ESTADO = { PRESENTE: 'presente', FALTA: 'falta', PENDIENTE: 'pendiente', PROXIMA: 'proxima' };

const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const claveMes = (iso) => iso.slice(0, 7);
const horaDe = (iso) => formatInTimeZone(new Date(iso), TZ, 'HH:mm');

// Mes inicial: el actual si tiene clases; si no, el que tenga clases más cercano a hoy.
function mesInicial(meses, hoy) {
  const actual = claveMes(hoy);
  if (meses.includes(actual)) return actual;
  const indice = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return [...meses].sort((a, b) => Math.abs(indice(a) - indice(actual)) - Math.abs(indice(b) - indice(actual)))[0];
}

// Anillo: verde = presentes, rojo = faltas, sobre las clases dictadas.
function Anillo({ presentes, faltas }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const dictadas = presentes + faltas;
  const pct = porcentaje(presentes, faltas);
  const verde = dictadas ? (presentes / dictadas) * c : 0;
  const rojo = dictadas ? (faltas / dictadas) * c : 0;
  const arco = (largo, inicio, color) =>
    largo > 0 && (
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeDasharray={`${largo} ${c - largo}`}
        strokeDashoffset={-inicio}
        transform="rotate(-90 60 60)"
      />
    );
  return (
    <div className="anillo-grande" role="img" aria-label={pct === null ? 'Sin clases dictadas' : `${pct}% de asistencia`}>
      <svg viewBox="0 0 120 120" width="180" height="180" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--next-bg)" strokeWidth="12" />
        {arco(verde, 0, 'var(--ok)')}
        {arco(rojo, verde, 'var(--bad)')}
      </svg>
      <div>
        <strong>{pct === null ? '—' : `${pct}%`}</strong>
        <span>asistencia</span>
      </div>
    </div>
  );
}

// Mi calendario: asistencia del módulo en formato mensual, resumen y PDF.
export default function Calendario() {
  const { usuario } = useAuth();
  usePageTitle('Mi calendario');
  const [historial, setHistorial] = useState(null);
  const [mes, setMes] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState(false);
  const rejilla = useRef(null);

  useEffect(() => {
    client
      .get('/asistencia/mis-asistencias')
      .then((res) => {
        setHistorial(res.data);
        const meses = [...new Set(res.data.fechas.map((f) => claveMes(f.fecha)))];
        if (meses.length) setMes(mesInicial(meses, res.data.hoy));
      })
      .catch((e) => {
        setError(true);
        toast.error(mensajeDe(e, 'No se pudo cargar tu calendario'));
      });
  }, []);

  // El popover se cierra con Esc o al hacer clic fuera de la cuadrícula.
  useEffect(() => {
    if (!abierto) return undefined;
    const tecla = (e) => e.key === 'Escape' && setAbierto(null);
    const clic = (e) => rejilla.current && !rejilla.current.contains(e.target) && setAbierto(null);
    document.addEventListener('keydown', tecla);
    document.addEventListener('mousedown', clic);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.removeEventListener('mousedown', clic);
    };
  }, [abierto]);

  const meses = useMemo(
    () => (historial ? [...new Set(historial.fechas.map((f) => claveMes(f.fecha)))].sort() : []),
    [historial]
  );
  const porFecha = useMemo(() => new Map((historial?.fechas || []).map((f) => [f.fecha, f])), [historial]);

  async function exportar() {
    setExportando(true);
    try {
      await exportarPdfAsistencia({ usuario, historial });
      toast.success('El reporte en PDF se descargó correctamente.');
    } catch (e) {
      toast.error('No se pudo generar el PDF');
    } finally {
      setExportando(false);
    }
  }

  if (error) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="No se pudo cargar tu calendario" text="Inténtalo de nuevo en unos minutos." />
      </Card>
    );
  }
  if (!historial) {
    return (
      <div className="cal-grid">
        <Card>
          <Skeleton filas={8} />
        </Card>
        <Card>
          <Skeleton filas={6} />
        </Card>
      </div>
    );
  }
  if (historial.fechas.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="Tu módulo aún no tiene clases programadas." />
      </Card>
    );
  }

  const { hoy, resumen, modulo, fechas } = historial;
  const [anio, numMes] = mes.split('-').map(Number);
  const primero = new Date(anio, numMes - 1, 1);
  const dias = eachDayOfInterval({ start: startOfMonth(primero), end: endOfMonth(primero) });
  const vacios = getISODay(dias[0]) - 1;
  const indiceMes = meses.indexOf(mes);
  const irMes = (delta) => {
    const destino = meses[indiceMes + delta];
    if (destino) {
      setMes(destino);
      setAbierto(null);
    }
  };
  const titulo = mayus(format(addMonths(primero, 0), 'LLLL yyyy', { locale: es }));

  const dictadas = resumen.presentes + resumen.faltas;
  const pendienteHoy = fechas.filter((f) => f.estado === 'PENDIENTE').length;
  const proximas = fechas.filter((f) => f.estado === 'PROXIMA').length;

  return (
    <div className="cal-grid">
      <Card className="cal-card">
        <div className="cal-cab">
          <button className="icon-btn-borde" aria-label="Mes anterior" disabled={indiceMes <= 0} onClick={() => irMes(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="cal-titulo">
            <h2>{titulo}</h2>
            <span>
              {modulo.nombre}
              {modulo.gestion ? ` · ${modulo.gestion}` : ''}
            </span>
          </div>
          <button
            className="icon-btn-borde"
            aria-label="Mes siguiente"
            disabled={indiceMes >= meses.length - 1}
            onClick={() => irMes(1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="cal-rejilla" ref={rejilla}>
          {DIAS.map((d) => (
            <div key={d} className="cal-dia-nombre">
              {d}
            </div>
          ))}
          {Array.from({ length: vacios }, (_, i) => (
            <div key={`v${i}`} />
          ))}
          {dias.map((dia, i) => {
            const iso = format(dia, 'yyyy-MM-dd');
            const f = porFecha.get(iso);
            if (!f) {
              return (
                <div key={iso} className="cal-dia sin-clase">
                  <span className="cal-num">{dia.getDate()}</span>
                </div>
              );
            }
            const esHoy = iso === hoy;
            const columna = (vacios + i) % 7;
            return (
              <div key={iso} className="cal-celda">
                <button
                  className={`cal-dia con-clase ${CLASE_ESTADO[f.estado]}${esHoy ? ' hoy' : ''}`}
                  aria-expanded={abierto === iso}
                  aria-label={`${fechaLarga(iso)}: ${f.estado.toLowerCase()}`}
                  onClick={() => setAbierto(abierto === iso ? null : iso)}
                >
                  <span className="cal-num">
                    {dia.getDate()}
                    {esHoy && <em className="cal-hoy">HOY</em>}
                  </span>
                  <span className="cal-estado">
                    <StatusBadge estado={f.estado} />
                  </span>
                  <span className={`cal-punto ${CLASE_ESTADO[f.estado]}`} aria-hidden="true" />
                  {f.hora_registro && <small className="cal-hora">{horaDe(f.hora_registro)}</small>}
                </button>
                {abierto === iso && (
                  <div className={`cal-pop${columna >= 4 ? ' derecha' : ''}`} role="dialog" aria-label="Detalle del día">
                    <strong>{fechaLarga(iso)}</strong>
                    <p>
                      Horario: {horaLegible(f.hora_inicio)} – {horaLegible(f.hora_fin)}
                    </p>
                    <p className="cal-pop-estado">
                      Estado: <StatusBadge estado={f.estado} />
                    </p>
                    {f.hora_registro && <p>Marcó a las {horaDe(f.hora_registro)}</p>}
                    {f.corregida && <p className="cal-pop-nota">Corregida por administración</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="cal-leyenda">
          <StatusBadge estado="PRESENTE" />
          <StatusBadge estado="FALTA" />
          <StatusBadge estado="PENDIENTE" />
          <StatusBadge estado="PROXIMA" />
          <span className="texto-muted">Días grises: sin clase</span>
        </div>
      </Card>

      <div className="col">
        <Card title="Resumen del módulo">
          <div className="cal-resumen">
            <Anillo presentes={resumen.presentes} faltas={resumen.faltas} />
            <dl>
              <div>
                <dt>Clases dictadas</dt>
                <dd>{dictadas}</dd>
              </div>
              <div>
                <dt>Presentes</dt>
                <dd className="ok">{resumen.presentes}</dd>
              </div>
              <div>
                <dt>Faltas</dt>
                <dd className="bad">{resumen.faltas}</dd>
              </div>
              <div>
                <dt>Pendiente hoy</dt>
                <dd className="warn">{pendienteHoy}</dd>
              </div>
              <div>
                <dt>Próximas</dt>
                <dd>{proximas}</dd>
              </div>
            </dl>
          </div>
        </Card>
        <Button size="lg" block icon={FileText} loading={exportando} onClick={exportar}>
          Exportar a PDF
        </Button>
        <div className="card cal-nota">
          <Info size={18} aria-hidden="true" />
          <p>El porcentaje solo cuenta clases ya dictadas. Las próximas no afectan tu promedio.</p>
        </div>
      </div>
    </div>
  );
}
