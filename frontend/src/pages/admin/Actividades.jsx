import { useEffect, useState } from 'react';
import { Calendar, History, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { ActionTag, Button, Card, DataTable, EmptyState, Paginacion, Persona, Skeleton } from '../../components/ui';
import { fechaHoraLegible, mensajeDe, usePageTitle } from '../../utils/format';

// Acciones que se ofrecen en el filtro (códigos que guarda el sistema).
const ACCIONES_FILTRO = [
  ['LOGIN', 'Inicio de sesión'],
  ['LOGOUT', 'Cierre de sesión'],
  ['LOGIN_FALLIDO', 'Intento de ingreso fallido'],
  ['MARCAR_ASISTENCIA', 'Marcó su asistencia'],
  ['MODIFICAR_ASISTENCIA', 'Corrigió una asistencia'],
  ['IMPORTAR_ESTUDIANTES', 'Importó estudiantes'],
  ['IMPORTAR_FECHAS', 'Importó fechas de clase'],
  ['ACTIVAR_MODULO', 'Activó un módulo'],
  ['EXPORTAR', 'Exportó asistencias'],
];

const LIMITE = 20;
const SIN_FILTROS = { estudiante: '', desde: '', hasta: '', accion: '' };

export default function Actividades() {
  usePageTitle('Actividad');
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);

  // `formulario` es lo que se está escribiendo; `filtros` lo que se aplicó al buscar.
  const [formulario, setFormulario] = useState(SIN_FILTROS);
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    client
      .get('/actividades', {
        params: {
          pagina,
          limite: LIMITE,
          estudiante: filtros.estudiante.trim() || undefined,
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
          accion: filtros.accion || undefined,
        },
      })
      .then((res) => {
        if (!vigente) return;
        setActividades(res.data.actividades || []);
        setTotalPaginas(res.data.totalPaginas || 1);
        setTotal(res.data.total || 0);
      })
      .catch((e) => {
        if (vigente) toast.error(mensajeDe(e, 'No se pudo cargar el historial de actividades'));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, pagina]);

  function cambiar(campo, valor) {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  }

  function aplicarFiltros(evento) {
    evento.preventDefault();
    setPagina(1);
    setFiltros(formulario);
  }

  function limpiarFiltros() {
    setFormulario(SIN_FILTROS);
    setFiltros(SIN_FILTROS);
    setPagina(1);
  }

  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <>
      <form className="card" onSubmit={aplicarFiltros}>
        <div className="filtros">
          <span className="input-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              className="input"
              aria-label="Buscar estudiante"
              value={formulario.estudiante}
              onChange={(e) => cambiar('estudiante', e.target.value)}
              maxLength={100}
              placeholder="Buscar estudiante"
            />
          </span>
          <select
            className="select"
            aria-label="Acción"
            value={formulario.accion}
            onChange={(e) => cambiar('accion', e.target.value)}
          >
            <option value="">Todas las acciones</option>
            {ACCIONES_FILTRO.map(([codigo, nombre]) => (
              <option key={codigo} value={codigo}>
                {nombre}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            lang="es"
            aria-label="Desde"
            value={formulario.desde}
            onChange={(e) => cambiar('desde', e.target.value)}
          />
          <input
            className="input"
            type="date"
            lang="es"
            aria-label="Hasta"
            value={formulario.hasta}
            onChange={(e) => cambiar('hasta', e.target.value)}
          />
          <Button type="submit">Filtrar</Button>
          <Button variant="ghost" onClick={limpiarFiltros}>
            Limpiar
          </Button>
        </div>
      </form>

      <Card
        title="Registros"
        actions={
          <span className="texto-muted">
            {total} {total === 1 ? 'registro' : 'registros'}
          </span>
        }
      >
        {cargando ? (
          <Skeleton filas={8} />
        ) : (
          <DataTable
            filas={actividades}
            rowKey={(a) => a.id}
            empty={
              <EmptyState
                icon={hayFiltros ? Calendar : History}
                title="Sin actividad"
                text={
                  hayFiltros
                    ? 'No se encontraron actividades con los filtros seleccionados.'
                    : 'Todavía no hay actividades en el módulo activo.'
                }
              />
            }
            columnas={[
              { titulo: 'Fecha y hora', render: (a) => <span style={{ whiteSpace: 'nowrap' }}>{fechaHoraLegible(a.creado_en)}</span> },
              { titulo: 'Acción', render: (a) => <ActionTag accion={a.accion} /> },
              {
                titulo: 'Usuario',
                render: (a) => (a.Usuario ? <Persona nombre={a.Usuario.nombre} /> : <span className="texto-muted">Sistema</span>),
              },
              { titulo: 'Detalle', className: 'gris', render: (a) => a.detalle || '—' },
              { titulo: 'IP', className: 'mono', render: (a) => a.ip || '—' },
            ]}
          />
        )}
        <Paginacion
          pagina={pagina}
          totalPaginas={totalPaginas}
          total={total}
          limite={LIMITE}
          deshabilitado={cargando}
          onChange={setPagina}
        />
      </Card>
    </>
  );
}
