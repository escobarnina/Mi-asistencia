import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { puedeActivar, textoFaltante, mensajeConfirmacion } from '../../api/modulos';
import { Button, Card, Modal, Skeleton, StatusBadge } from '../../components/ui';
import { mensajeDe, usePageTitle } from '../../utils/format';
import { ESTUDIANTES, FECHAS, ImportarExcel } from './Estudiantes';

// Pasos 2 y 3 de un módulo nuevo (RF-13): cargar sus estudiantes y fechas con la
// vista previa de siempre (RF-16) y, cuando ya tiene ambos, activarlo.
export default function ModuloDatos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [modulo, setModulo] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [activando, setActivando] = useState(false);
  usePageTitle(modulo ? modulo.nombre : 'Datos del módulo');

  const cargar = useCallback(async () => {
    try {
      const res = await client.get(`/modulos/${id}`);
      setModulo(res.data.modulo);
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo cargar el módulo'));
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function activar() {
    setActivando(true);
    try {
      await client.post(`/modulos/${modulo.id}/activar`);
      toast.success(`"${modulo.nombre}" es ahora el módulo activo.`);
      navegar('/admin/modulos', { replace: true });
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo activar el módulo'));
      setActivando(false);
      setConfirmando(false);
    }
  }

  if (!modulo) {
    return (
      <Card>
        <Skeleton filas={4} />
      </Card>
    );
  }

  // Un módulo que ya estuvo activo es historia: sus datos no se modifican.
  const reemplazado = !modulo.activo && Boolean(modulo.activado_en);

  return (
    <>
      <Card
        title={`${modulo.nombre}${modulo.gestion ? ` (${modulo.gestion})` : ''}`}
        actions={<StatusBadge estado={modulo.activo ? 'ACTIVO' : 'INACTIVO'} />}
      >
        <div className="card-body">
          <p className="texto-muted">
            {modulo.inscritos} {Number(modulo.inscritos) === 1 ? 'estudiante' : 'estudiantes'} · {modulo.fechas}{' '}
            {Number(modulo.fechas) === 1 ? 'fecha' : 'fechas'} de clase
          </p>
        </div>
      </Card>

      {reemplazado ? (
        <p className="texto-muted">
          Este módulo ya se usó y fue reemplazado. Sus datos se conservan y no se pueden modificar.
        </p>
      ) : (
        <>
          <p className="texto-muted">
            Los archivos se importan a <strong>{modulo.nombre}</strong>
            {modulo.activo ? ' (módulo activo)' : ' (todavía inactivo)'}. El módulo activo actual no se modifica
            hasta que actives este.
          </p>
          <ImportarExcel config={ESTUDIANTES} hayModulo moduloId={modulo.id} onImportado={cargar} />
          <ImportarExcel config={FECHAS} hayModulo moduloId={modulo.id} onImportado={cargar} />
        </>
      )}

      {!modulo.activo && (
        <Card title="Activar módulo">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            {puedeActivar(modulo) ? (
              <p className="texto-muted">
                Listo para activar: {modulo.inscritos} estudiantes y {modulo.fechas} fechas.
              </p>
            ) : (
              <p className="texto-muted">{textoFaltante(modulo)}. Impórtalos para poder activarlo.</p>
            )}
            <Button icon={PlayCircle} onClick={() => setConfirmando(true)} disabled={!puedeActivar(modulo)}>
              Activar módulo
            </Button>
          </div>
        </Card>
      )}

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
