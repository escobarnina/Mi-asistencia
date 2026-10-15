import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { puedeActivar, textoFaltante, mensajeConfirmacion } from '../../api/modulos';
import { Button, Card, DataTable, EmptyState, Modal, Skeleton, StatusBadge } from '../../components/ui';
import { mensajeDe, usePageTitle } from '../../utils/format';

// Gestión de módulos (RF-13). Flujo de un módulo nuevo:
//   1. Crear el módulo (queda inactivo).  2. Cargar sus estudiantes y fechas.
//   3. Activarlo (solo si ya tiene ambos). Solo uno puede estar activo.
export default function Modulos() {
  usePageTitle('Módulos');
  const navegar = useNavigate();
  const [modulos, setModulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [gestion, setGestion] = useState('');
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
    setEnviando(true);
    try {
      const res = await client.post('/modulos', { nombre, gestion: gestion.trim() || null });
      // Siguiente paso: cargar los estudiantes y las fechas de ESE módulo.
      navegar(`/admin/modulos/${res.data.modulo.id}/datos`);
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
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo activar el módulo'));
    } finally {
      setActivando(false);
    }
  }

  return (
    <>
      <Card title="Nuevo módulo">
        <form className="form-fila" onSubmit={crear}>
          <label className="field">
            Nombre
            <input
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={120}
              required
              placeholder="Ej.: Módulo 2"
            />
          </label>
          <label className="field">
            Gestión
            <input
              className="input"
              value={gestion}
              onChange={(e) => setGestion(e.target.value)}
              maxLength={10}
              placeholder="Ej.: 1-2027"
            />
          </label>
          <Button type="submit" loading={enviando} disabled={!nombre.trim()}>
            {enviando ? 'Creando…' : 'Crear módulo'}
          </Button>
        </form>
        <p className="hint" style={{ padding: '0 20px 16px' }}>
          El módulo queda inactivo. Luego cargarás sus estudiantes y fechas y, por último, lo activarás.
        </p>
      </Card>

      <Card title="Módulos">
        {cargando ? (
          <Skeleton filas={4} />
        ) : (
          <DataTable
            filas={modulos}
            rowKey={(m) => m.id}
            empty={<EmptyState icon={Layers} title="Sin módulos" text="Todavía no hay módulos." />}
            columnas={[
              { titulo: 'Nombre', render: (m) => <strong>{m.nombre}</strong> },
              { titulo: 'Gestión', render: (m) => m.gestion || '—' },
              { titulo: 'Inscritos', render: (m) => m.inscritos },
              { titulo: 'Fechas', render: (m) => m.fechas },
              { titulo: 'Estado', render: (m) => <StatusBadge estado={m.activo ? 'ACTIVO' : 'INACTIVO'} /> },
              {
                titulo: '',
                render: (m) =>
                  !m.activo && (
                    <div className="acciones">
                      {!m.activado_en && (
                        <Link className="btn btn-secondary" to={`/admin/modulos/${m.id}/datos`}>
                          Cargar datos
                        </Link>
                      )}
                      <Button
                        variant="secondary"
                        icon={PlayCircle}
                        className={puedeActivar(m) ? '' : 'btn-apagado'}
                        title={puedeActivar(m) ? '' : textoFaltante(m)}
                        onClick={() => (puedeActivar(m) ? setAActivar(m) : toast.error(textoFaltante(m)))}
                      >
                        Activar
                      </Button>
                    </div>
                  ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={Boolean(aActivar)}
        icon={PlayCircle}
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
