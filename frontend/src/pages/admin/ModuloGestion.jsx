import { useCallback, useEffect, useState } from 'react';
import { Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Info, Lock, Pencil, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { puedeActivar, textoFaltante, mensajeConfirmacion } from '../../api/modulos';
import { Button, Card, Modal, Skeleton, StatusBadge, Tabs } from '../../components/ui';
import EstudiantesTab from '../../components/gestion/EstudiantesTab';
import FechasTab from '../../components/gestion/FechasTab';
import { mensajeDe, usePageTitle } from '../../utils/format';

// Gestión de un módulo (Fase B): estudiantes y fechas editables en cualquier momento,
// a mano o por Excel, antes o después de activarlo.
export default function ModuloGestion() {
  const { id } = useParams();
  const { refrescarModulo } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'fechas' ? 'fechas' : 'estudiantes';

  const [modulo, setModulo] = useState(null);
  const [sesiones, setSesiones] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [noEncontrado, setNoEncontrado] = useState(false);

  const [edicion, setEdicion] = useState(null);
  const [errorEdicion, setErrorEdicion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [activando, setActivando] = useState(false);

  usePageTitle(modulo ? `${modulo.nombre} · ${modulo.gestion || ''}` : 'Gestionar módulo');

  // Vuelve a pedir el módulo (contadores) y sus fechas, y avisa a las pestañas.
  const refrescar = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([client.get(`/modulos/${id}`), client.get(`/modulos/${id}/sesiones`)]);
      setModulo(m.data.modulo);
      setSesiones(s.data.sesiones);
      setRecarga((n) => n + 1);
    } catch (e) {
      if (e.response?.status === 404 || e.response?.status === 400) setNoEncontrado(true);
      else toast.error(mensajeDe(e, 'No se pudo cargar el módulo'));
    }
  }, [id]);

  useEffect(() => {
    setModulo(null);
    setSesiones(null);
    refrescar();
  }, [refrescar]);

  if (noEncontrado) return <Navigate to="/admin/modulos" replace />;
  if (!modulo || !sesiones) {
    return (
      <Card>
        <Skeleton filas={5} />
      </Card>
    );
  }

  const archivado = !modulo.activo && Boolean(modulo.activado_en);
  const estado = modulo.activo ? 'ACTIVO' : archivado ? 'ARCHIVADO' : 'INACTIVO';
  const tieneAsistencias = sesiones.some((s) => s.tiene_asistencias);

  async function guardarEdicion(evento) {
    evento.preventDefault();
    setErrorEdicion('');
    setGuardando(true);
    try {
      await client.patch(`/modulos/${modulo.id}`, {
        nombre: edicion.nombre.trim(),
        gestion: edicion.gestion.trim() || null,
      });
      toast.success('Módulo actualizado');
      setEdicion(null);
      await refrescar();
      refrescarModulo?.();
    } catch (e) {
      setErrorEdicion(mensajeDe(e, 'No se pudo actualizar el módulo'));
    } finally {
      setGuardando(false);
    }
  }

  async function activar() {
    setActivando(true);
    try {
      await client.post(`/modulos/${modulo.id}/activar`);
      toast.success(`"${modulo.nombre}" es ahora el módulo activo.`);
      setConfirmando(false);
      await refrescar();
      refrescarModulo?.();
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo activar el módulo'));
      setConfirmando(false);
    } finally {
      setActivando(false);
    }
  }

  function intentarActivar() {
    if (puedeActivar(modulo)) setConfirmando(true);
    else toast.error('Agrega al menos 1 estudiante y 1 fecha');
  }

  const ayuda = archivado
    ? 'Este módulo ya se usó y fue reemplazado: sus datos se conservan y solo se pueden consultar.'
    : modulo.activo
      ? 'Módulo en uso: puedes seguir agregando estudiantes y fechas. Las fechas con asistencias no se pueden borrar.'
      : 'Agrega, edita o quita estudiantes y fechas cuando quieras, antes o después de activar.';

  return (
    <>
      <Card>
        <div className="gestion-cab">
          <div>
            <div className="gestion-titulo">
              <h2>{modulo.nombre}</h2>
              <span className="gest">{modulo.gestion}</span>
              <StatusBadge estado={estado} />
              {!archivado && (
                <button
                  className="icon-btn"
                  aria-label="Editar nombre y gestión"
                  title="Editar nombre y gestión"
                  onClick={() => {
                    setErrorEdicion('');
                    setEdicion({ nombre: modulo.nombre, gestion: modulo.gestion || '' });
                  }}
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
              )}
              {archivado && <Lock size={16} color="var(--muted)" aria-label="Solo lectura" />}
            </div>
            <p className="gestion-ayuda">
              <Info size={16} aria-hidden="true" /> {ayuda}
            </p>
          </div>
          <div className="gestion-cuenta">
            <span className="cifras">
              <strong>{modulo.inscritos}</strong> {Number(modulo.inscritos) === 1 ? 'estudiante' : 'estudiantes'} ·{' '}
              <strong>{modulo.fechas}</strong> {Number(modulo.fechas) === 1 ? 'fecha' : 'fechas'}
            </span>
            {estado === 'INACTIVO' && (
              <Button
                icon={ArrowRight}
                className={puedeActivar(modulo) ? '' : 'btn-apagado'}
                title={puedeActivar(modulo) ? undefined : textoFaltante(modulo)}
                onClick={intentarActivar}
              >
                Activar módulo
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Tabs
        activa={tab}
        onChange={(t) => setParams(t === 'fechas' ? { tab: 'fechas' } : {}, { replace: true })}
        tabs={[
          { id: 'estudiantes', label: 'Estudiantes', count: Number(modulo.inscritos) },
          { id: 'fechas', label: 'Fechas de clase', count: Number(modulo.fechas) },
        ]}
      />

      {tab === 'estudiantes' ? (
        <EstudiantesTab
          modulo={modulo}
          soloLectura={archivado}
          tieneAsistencias={tieneAsistencias}
          refrescar={refrescar}
          recarga={recarga}
        />
      ) : (
        <FechasTab
          modulo={modulo}
          sesiones={sesiones}
          soloLectura={archivado}
          tieneAsistencias={tieneAsistencias}
          refrescar={refrescar}
        />
      )}

      <Modal
        open={Boolean(edicion)}
        icon={Pencil}
        title="Editar módulo"
        onClose={() => !guardando && setEdicion(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setEdicion(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-modulo" loading={guardando} disabled={!edicion?.nombre.trim()}>
              Guardar cambios
            </Button>
          </>
        }
      >
        {edicion && (
          <form id="form-modulo" onSubmit={guardarEdicion} className="modal-contenido" style={{ marginBottom: 0 }}>
            <label className="field">
              Nombre
              <input
                className="input"
                value={edicion.nombre}
                maxLength={120}
                autoFocus
                onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
              />
            </label>
            <label className="field">
              Gestión
              <input
                className={`input${errorEdicion ? ' invalido' : ''}`}
                value={edicion.gestion}
                maxLength={10}
                placeholder="1-2027"
                onChange={(e) => setEdicion({ ...edicion, gestion: e.target.value })}
              />
              <span className="hint">Formato N-AAAA, por ejemplo 1-2027.</span>
              {errorEdicion && <span className="field-error">{errorEdicion}</span>}
            </label>
          </form>
        )}
      </Modal>

      <Modal
        open={confirmando}
        icon={PlayCircle}
        title="¿Activar este módulo?"
        text={mensajeConfirmacion(modulo)}
        onClose={() => !activando && setConfirmando(false)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setConfirmando(false)} disabled={activando}>
              Cancelar
            </Button>
            <Button loading={activando} onClick={activar}>
              Activar módulo
            </Button>
          </>
        }
      />
    </>
  );
}

// La ruta anterior /admin/modulos/:id/datos redirige a la nueva página de gestión.
export function RedirigirDatos() {
  const { id } = useParams();
  return <Navigate to={`/admin/modulos/${id}`} replace />;
}
