import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarX, Download, Percent, Search, UserCheck, UserX, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import {
  ActionTag,
  Button,
  Card,
  DataTable,
  EmptyState,
  Persona,
  Skeleton,
  StatCard,
  StatusBadge,
} from '../../components/ui';
import { descargarAsistencias } from '../../api/exportar';
import { diaMes, fechaHoraLegible, horaMarca, hoyLaPaz, mensajeDe, porcentaje, usePageTitle } from '../../utils/format';

const TEXTO_ACCION = {
  LOGIN: 'inició sesión',
  LOGOUT: 'cerró sesión',
  LOGIN_FALLIDO: 'intento de ingreso fallido',
  MARCAR_ASISTENCIA: 'marcó su asistencia',
  MODIFICAR_ASISTENCIA: 'corrigió una asistencia',
  CORREGIR_ASISTENCIA: 'corrigió una asistencia',
  IMPORTAR_ESTUDIANTES: 'importó estudiantes',
  IMPORTAR_FECHAS: 'importó fechas de clase',
  ACTIVAR_MODULO: 'activó un módulo',
  EXPORTAR: 'exportó asistencias',
};

// Dashboard del administrador. Todo se calcula con los endpoints existentes.
export default function InicioAdmin() {
  usePageTitle('Inicio');
  const [reporte, setReporte] = useState(null);
  const [inscritos, setInscritos] = useState(0);
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [exportando, setExportando] = useState(false);
  const hoy = hoyLaPaz();

  useEffect(() => {
    Promise.all([
      client.get('/admin/asistencias'),
      client.get('/admin/estudiantes'),
      client.get('/actividades', { params: { limite: 5 } }),
    ])
      .then(([r, e, a]) => {
        setReporte(r.data);
        setInscritos(e.data.total || 0);
        setActividades(a.data.actividades || []);
      })
      .catch((e) => toast.error(mensajeDe(e, 'No se pudo cargar el panel')))
      .finally(() => setCargando(false));
  }, []);

  const sesionHoy = reporte?.sesiones.find((s) => s.fecha === hoy);
  const porClase = useMemo(
    () =>
      (reporte?.sesiones || [])
        .filter((s) => s.fecha <= hoy)
        .map((s) => ({ fecha: s.fecha, pct: porcentaje(s.presentes, s.faltas) ?? 0 })),
    [reporte, hoy]
  );
  const filas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (sesionHoy?.asistencias || []).filter(
      (f) => !q || f.estudiante.nombre.toLowerCase().includes(q) || (f.estudiante.codigo || '').toLowerCase().includes(q)
    );
  }, [sesionHoy, texto]);

  const totales = reporte?.totales || { presentes: 0, faltas: 0 };
  const general = porcentaje(totales.presentes, totales.faltas);

  async function exportar() {
    setExportando(true);
    try {
      await descargarAsistencias({ fecha: hoy });
      toast.success('La exportación a Excel se descargó correctamente.');
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudieron exportar las asistencias'));
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <div className="stats-grid">
        {cargando ? (
          Array.from({ length: 4 }, (_, i) => (
            <div className="card" key={i}>
              <Skeleton filas={2} />
            </div>
          ))
        ) : (
          <>
            <StatCard icon={Users} label="Inscritos" value={inscritos} sub="en el módulo activo" />
            <StatCard
              icon={UserCheck}
              tono="ok"
              label="Presentes hoy"
              value={sesionHoy ? `${sesionHoy.presentes} / ${sesionHoy.asistencias.length}` : '—'}
              sub={sesionHoy ? `${sesionHoy.pendientes} pendientes` : 'Hoy no hay clase'}
            />
            <StatCard
              icon={Percent}
              label="Asistencia general"
              value={general === null ? '—' : `${general}%`}
              sub="clases ya dictadas"
            />
            <StatCard icon={UserX} tono="bad" label="Faltas" value={totales.faltas} valueTone="bad" sub="acumuladas" />
          </>
        )}
      </div>

      <div className="dash-grid">
        <Card
          title={`Asistencia de hoy · ${diaMes(hoy)}`}
          actions={
            <>
              <span className="input-wrap">
                <Search size={16} aria-hidden="true" />
                <input
                  className="input"
                  placeholder="Buscar estudiante"
                  aria-label="Buscar estudiante"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </span>
              <Button variant="secondary" icon={Download} loading={exportando} onClick={exportar}>
                Exportar
              </Button>
            </>
          }
        >
          {cargando ? (
            <Skeleton filas={5} />
          ) : !sesionHoy ? (
            <EmptyState icon={CalendarX} title="Hoy no hay clase" text="Cuando haya una clase programada aparecerá aquí." />
          ) : (
            <DataTable
              filas={filas}
              rowKey={(f) => f.estudiante.id}
              empty={<EmptyState title="Sin resultados" text="Ningún estudiante coincide con la búsqueda." />}
              columnas={[
                { titulo: 'Estudiante', render: (f) => <Persona nombre={f.estudiante.nombre} /> },
                { titulo: 'Registro', className: 'mono', render: (f) => f.estudiante.codigo || '—' },
                { titulo: 'Hora', render: (f) => (f.hora_registro ? horaMarca(f.hora_registro) : '—') },
                { titulo: 'Estado', render: (f) => <StatusBadge estado={f.estado} /> },
              ]}
            />
          )}
        </Card>

        <div className="col">
          <Card title="Asistencia por clase">
            <div className="card-body">
              {cargando ? (
                <Skeleton filas={3} />
              ) : porClase.length === 0 ? (
                <p className="texto-muted">Aún no hay clases dictadas.</p>
              ) : (
                porClase.map((c) => (
                  <div className="barra-fila" key={c.fecha}>
                    <span>{diaMes(c.fecha)}</span>
                    <div className="barra-pista" aria-hidden="true">
                      <div className="barra-relleno" style={{ width: `${c.pct}%` }} />
                    </div>
                    <strong>{c.pct}%</strong>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="Actividad reciente" actions={<Link to="/admin/actividades">Ver todo</Link>}>
            <div className="card-body">
              {cargando ? (
                <Skeleton filas={3} />
              ) : actividades.length === 0 ? (
                <p className="texto-muted">Sin actividad todavía.</p>
              ) : (
                actividades.map((a) => (
                  <div className="actividad-item" key={a.id}>
                    <ActionTag accion={a.accion} />
                    <div>
                      {a.Usuario?.nombre || 'Sistema'} {TEXTO_ACCION[a.accion] || ''}
                      <small>{fechaHoraLegible(a.creado_en)}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
