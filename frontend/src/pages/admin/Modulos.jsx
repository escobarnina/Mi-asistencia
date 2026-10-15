import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Eye, Layers, Pencil, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { puedeActivar, textoFaltante, mensajeConfirmacion } from '../../api/modulos';
import { Button, Card, DataTable, EmptyState, Modal, Skeleton, StatusBadge } from '../../components/ui';
import { mensajeDe, usePageTitle } from '../../utils/format';

// Estado visible de un módulo: el que ya estuvo activo y fue reemplazado queda archivado.
const estadoDe = (m) => (m.activo ? 'ACTIVO' : m.activado_en ? 'ARCHIVADO' : 'INACTIVO');

// Lista de módulos (RF-13). Crear un módulo lleva directo a su página de gestión,
// donde se agregan estudiantes y fechas en cualquier orden y se activa cuando se quiera.
export default function Modulos() {
  usePageTitle('Módulos');
  const navegar = useNavigate();
  const { refrescarModulo } = useOutletContext() || {};
  const [modulos, setModulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [gestion, setGestion] = useState('');
  const [errorGestion, setErrorGestion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aActivar, setAActivar] = useState(null);
  const [activando, setActivando] = useState(false);

  async function cargar() {
    try {
      const res = await client.get('/modulos');
      setModulos(res.data.modulos);
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudieron cargar los módulos'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(evento) {
    evento.preventDefault();
    setErrorGestion('');
    if (gestion.trim() && !/^[0-9]-[0-9]{4}$/.test(gestion.trim())) {
      setErrorGestion('Usa el formato N-AAAA, por ejemplo 1-2027');
      return;
    }
    setEnviando(true);
    try {
      const res = await client.post('/modulos', { nombre, gestion: gestion.trim() || null });
      navegar(`/admin/modulos/${res.data.modulo.id}`);
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo crear el módulo'));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarActivacion() {
    setActivando(true);
    try {
      await client.post(`/modulos/${aActivar.id}/activar`);
      toast.success(`"${aActivar.nombre}" es ahora el módulo activo.`);
      setAActivar(null);
      await cargar();
      refrescarModulo?.();
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo activar el módulo'));
    } finally {
      setActivando(false);
    }
  }

  const acciones = (m) => {
    const estado = estadoDe(m);
    if (estado === 'ARCHIVADO') {
      return (
        <div className="acciones-fila">
          <Link className="btn btn-secondary" to={`/admin/modulos/${m.id}`}>
            <Eye size={16} aria-hidden="true" /> Ver
          </Link>
        </div>
      );
    }
    return (
      <div className="acciones-fila">
        <Link className="btn btn-secondary" to={`/admin/modulos/${m.id}`}>
          <Pencil size={16} aria-hidden="true" /> Gestionar
        </Link>
        {estado === 'INACTIVO' && (
          <Button
            variant="secondary"
            className={puedeActivar(m) ? '' : 'btn-apagado'}
            title={puedeActivar(m) ? undefined : 'Agrega al menos 1 estudiante y 1 fecha'}
            aria-disabled={!puedeActivar(m)}
            onClick={() => (puedeActivar(m) ? setAActivar(m) : toast.error(textoFaltante(m) ? 'Agrega al menos 1 estudiante y 1 fecha' : ''))}
          >
            Activar
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <Card>
        <form className="form-fila" onSubmit={crear} noValidate>
          <label className="field" style={{ flex: '2 1 260px' }}>
            Nombre
            <input
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={120}
              required
              placeholder="Módulo 3"
            />
          </label>
          <label className="field">
            Gestión
            <input
              className={`input${errorGestion ? ' invalido' : ''}`}
              value={gestion}
              onChange={(e) => setGestion(e.target.value)}
              maxLength={10}
              placeholder="1-2027"
            />
            {errorGestion && <span className="field-error">{errorGestion}</span>}
          </label>
          <Button type="submit" icon={Plus} loading={enviando} disabled={!nombre.trim()}>
            {enviando ? 'Creando…' : 'Crear y gestionar'}
          </Button>
        </form>
        <p className="hint" style={{ padding: '0 20px 16px' }}>
          El módulo se crea inactivo. Después agregas sus estudiantes y fechas cuando quieras y lo activas.
        </p>
      </Card>

      <Card>
        {cargando ? (
          <Skeleton filas={4} />
        ) : (
          <DataTable
            filas={modulos}
            rowKey={(m) => m.id}
            empty={<EmptyState icon={Layers} title="Sin módulos" text="Todavía no hay módulos." />}
            columnas={[
              { titulo: 'Módulo', render: (m) => <strong>{m.nombre}</strong> },
              { titulo: 'Gestión', render: (m) => m.gestion || '—' },
              {
                titulo: 'Estudiantes',
                render: (m) => <span className={Number(m.inscritos) === 0 ? 'texto-muted' : ''}>{m.inscritos}</span>,
              },
              {
                titulo: 'Fechas',
                render: (m) => <span className={Number(m.fechas) === 0 ? 'texto-muted' : ''}>{m.fechas}</span>,
              },
              { titulo: 'Estado', render: (m) => <StatusBadge estado={estadoDe(m)} /> },
              { titulo: 'Acciones', render: acciones },
            ]}
          />
        )}
      </Card>

      <Modal
        open={Boolean(aActivar)}
        icon={Layers}
        title="¿Activar este módulo?"
        text={aActivar ? mensajeConfirmacion(aActivar) : ''}
        onClose={() => !activando && setAActivar(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setAActivar(null)} disabled={activando}>
              Cancelar
            </Button>
            <Button loading={activando} onClick={confirmarActivacion}>
              Activar módulo
            </Button>
          </>
        }
      />
    </>
  );
}
