import { useEffect, useState } from 'react';
import { ArrowRight, Download, Pencil, Search, UserCheck, UserX, Clock, CalendarX } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { descargarAsistencias } from '../../api/exportar';
import { Button, Card, DataTable, EmptyState, Modal, Persona, Skeleton, StatCard, StatusBadge } from '../../components/ui';
import { fechaLegible, horaLegible, horaMarca, hoyLaPaz, mensajeDe, usePageTitle } from '../../utils/format';

const FECHA_HOY = hoyLaPaz();

export default function Asistencias() {
  usePageTitle('Asistencias');
  const [fecha, setFecha] = useState(FECHA_HOY);
  const [estudiante, setEstudiante] = useState('');
  const [filtros, setFiltros] = useState({ fecha: FECHA_HOY, estudiante: '' });
  const [sesiones, setSesiones] = useState([]);
  const [totales, setTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    client
      .get('/admin/asistencias', {
        params: { fecha: filtros.fecha || undefined, estudiante: filtros.estudiante.trim() || undefined },
      })
      .then((res) => {
        if (!vigente) return;
        setSesiones(res.data.sesiones);
        setTotales(res.data.totales);
      })
      .catch((e) => {
        if (vigente) toast.error(mensajeDe(e, 'No se pudieron cargar las asistencias'));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, recarga]);

  function buscar(evento) {
    evento.preventDefault();
    setFiltros({ fecha, estudiante });
  }

  async function exportar() {
    setExportando(true);
    try {
      await descargarAsistencias(filtros);
      toast.success('La exportación a Excel se descargó correctamente.');
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudieron exportar las asistencias'));
    } finally {
      setExportando(false);
    }
  }

  async function guardarCorreccion(evento) {
    evento.preventDefault();
    if (!edicion) return;
    setGuardando(true);
    try {
      await client.put(`/admin/asistencias/${edicion.sesionId}/${edicion.estudianteId}`, {
        estado: edicion.estado,
        motivo: edicion.motivo,
      });
      toast.success('Asistencia corregida.');
      setEdicion(null);
      setRecarga((n) => n + 1);
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo corregir la asistencia'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {totales && !cargando && sesiones.length > 0 && (
        <div className="stats-grid" aria-label="Totales generales" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <StatCard icon={UserCheck} tono="ok" label="Presentes" value={totales.presentes} />
          <StatCard icon={UserX} tono="bad" label="Faltas" value={totales.faltas} valueTone="bad" />
          <StatCard icon={Clock} tono="warn" label="Pendientes" value={totales.pendientes} />
        </div>
      )}

      <form className="card" onSubmit={buscar}>
        <div className="filtros">
          <input
            className="input"
            type="date"
            aria-label="Fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <span className="input-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              aria-label="Estudiante"
              value={estudiante}
              onChange={(e) => setEstudiante(e.target.value)}
              maxLength={100}
              placeholder="Nombre o número de registro"
            />
          </span>
          <Button type="submit">Buscar</Button>
          <Button variant="secondary" icon={Download} loading={exportando} onClick={exportar}>
            Exportar a Excel
          </Button>
        </div>
      </form>

      {cargando ? (
        <Card>
          <Skeleton filas={6} />
        </Card>
      ) : sesiones.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarX} title="Sin sesiones" text="No hay sesiones de clase para los filtros seleccionados." />
        </Card>
      ) : (
        sesiones.map((sesion) => (
          <Card key={sesion.id}>
            <div className="sesion-titulo">
              <div>
                <h3>Sesión del {fechaLegible(sesion.fecha)}</h3>
                <p className="nota">
                  Horario: {horaLegible(sesion.hora_inicio)}–{horaLegible(sesion.hora_fin)}
                </p>
              </div>
              <div className="mini-totales" aria-label="Totales de asistencia">
                <span>Presentes: {sesion.presentes}</span>
                <span>Faltas: {sesion.faltas}</span>
                <span>Pendientes: {sesion.pendientes}</span>
              </div>
            </div>
            <DataTable
              filas={sesion.asistencias}
              rowKey={(f) => `${sesion.id}-${f.estudiante.id}`}
              columnas={[
                { titulo: 'Estudiante', render: (f) => <Persona nombre={f.estudiante.nombre} /> },
                { titulo: 'Registro', className: 'mono', render: (f) => f.estudiante.codigo || '—' },
                { titulo: 'Correo', className: 'gris', render: (f) => f.estudiante.email },
                {
                  titulo: 'Estado',
                  render: (f) => (
                    <>
                      <StatusBadge estado={f.estado} />
                      {f.automatica && <span className="texto-muted"> (automática)</span>}
                    </>
                  ),
                },
                { titulo: 'Hora de marca', render: (f) => (f.hora_registro ? horaMarca(f.hora_registro) : '—') },
                {
                  titulo: '',
                  render: (f) => (
                    <Button
                      variant="secondary"
                      icon={Pencil}
                      onClick={() =>
                        setEdicion({
                          sesion,
                          fila: f,
                          sesionId: sesion.id,
                          estudianteId: f.estudiante.id,
                          estado: f.estado === 'PRESENTE' ? 'FALTA' : 'PRESENTE',
                          motivo: '',
                        })
                      }
                    >
                      Corregir
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        ))
      )}

      <Modal
        open={Boolean(edicion)}
        icon={Pencil}
        title="Corregir asistencia"
        text={edicion ? `${edicion.fila.estudiante.nombre} · ${fechaLegible(edicion.sesion.fecha)}` : ''}
        onClose={() => !guardando && setEdicion(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setEdicion(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-correccion" loading={guardando}>
              Guardar corrección
            </Button>
          </>
        }
      >
        {edicion && (
          <form id="form-correccion" onSubmit={guardarCorreccion} className="modal-contenido" style={{ marginBottom: 0 }}>
            <div className="cambio-estado">
              <StatusBadge estado={edicion.fila.estado} />
              <ArrowRight size={16} aria-hidden="true" />
              <StatusBadge estado={edicion.estado} />
            </div>
            <label className="field">
              Nuevo estado
              <select
                className="select"
                value={edicion.estado}
                onChange={(e) => setEdicion({ ...edicion, estado: e.target.value })}
              >
                <option value="PRESENTE">Presente</option>
                <option value="FALTA">Falta</option>
              </select>
            </label>
            <label className="field">
              Motivo
              <input
                className="input"
                value={edicion.motivo}
                onChange={(e) => setEdicion({ ...edicion, motivo: e.target.value })}
                maxLength={255}
                required
                autoFocus
              />
            </label>
          </form>
        )}
      </Modal>
    </>
  );
}
