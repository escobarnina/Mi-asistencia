import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

const ACCIONES_DISPONIBLES = [
  'LOGIN',
  'LOGOUT',
  'LOGIN_FALLIDO',
  'MARCAR_ASISTENCIA',
  'MODIFICAR_ASISTENCIA',
  'GENERAR_FALTAS',
  'IMPORTAR_ESTUDIANTES',
  'IMPORTAR_FECHAS',
  'ACTIVAR_MODULO',
  'EXPORTAR',
];

function formatearFecha(fechaStr) {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Actividades() {
  const [actividades, setActividades] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [filtroModulo, setFiltroModulo] = useState('');
  const [filtroAccion, setFiltroAccion] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  // Paginación
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  // Cargar módulos para el selector de filtro
  useEffect(() => {
    async function cargarModulos() {
      try {
        const res = await client.get('/modulos');
        setModulos(res.data.modulos || []);
      } catch (e) {
        // Ignora silenciosamente si falla la lista de módulos
      }
    }
    cargarModulos();
  }, []);

  async function cargarActividades(nuevaPagina = 1) {
    setCargando(true);
    setError('');
    try {
      const params = {
        pagina: nuevaPagina,
        limite: 20,
      };
      if (filtroModulo) params.modulo_id = filtroModulo;
      if (filtroAccion) params.accion = filtroAccion;
      if (filtroDesde) params.desde = filtroDesde;
      if (filtroHasta) params.hasta = filtroHasta;

      const res = await client.get('/actividades', { params });
      setActividades(res.data.actividades || []);
      setPagina(res.data.pagina || 1);
      setTotalPaginas(res.data.totalPaginas || 1);
      setTotal(res.data.total || 0);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo cargar el historial de actividades'));
    } finally {
      setCargando(false);
    }
  }

  // Recargar al cambiar página
  useEffect(() => {
    cargarActividades(pagina);
  }, [pagina]);

  function aplicarFiltros(e) {
    e.preventDefault();
    setPagina(1);
    cargarActividades(1);
  }

  function limpiarFiltros() {
    setFiltroModulo('');
    setFiltroAccion('');
    setFiltroDesde('');
    setFiltroHasta('');
    setPagina(1);
  }

  return (
    <div className="pagina">
      <Link to="/admin" className="volver">
        ← Volver al panel
      </Link>
      <h2>Historial de Actividad (RF-10)</h2>

      {error && <p className="error">{error}</p>}

      {/* Formulario de Filtros */}
      <div className="tarjeta form-modulo" style={{ marginBottom: '20px' }}>
        <h3>Filtros de búsqueda</h3>
        <form onSubmit={aplicarFiltros}>
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="filtro-modulo">Módulo</label>
              <select
                id="filtro-modulo"
                value={filtroModulo}
                onChange={(e) => setFiltroModulo(e.target.value)}
                style={{ padding: '9px', borderRadius: '6px', border: '1px solid var(--gris-borde)' }}
              >
                <option value="">Todos los módulos</option>
                {modulos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.gestion || 'Sin gestión'})
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="filtro-accion">Acción</label>
              <select
                id="filtro-accion"
                value={filtroAccion}
                onChange={(e) => setFiltroAccion(e.target.value)}
                style={{ padding: '9px', borderRadius: '6px', border: '1px solid var(--gris-borde)' }}
              >
                <option value="">Todas las acciones</option>
                {ACCIONES_DISPONIBLES.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="filtro-desde">Desde</label>
              <input
                id="filtro-desde"
                type="date"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
              />
            </div>

            <div className="campo">
              <label htmlFor="filtro-hasta">Hasta</label>
              <input
                id="filtro-hasta"
                type="date"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button type="submit" className="btn btn-principal btn-crear">
              Filtrar
            </button>
            <button
              type="button"
              className="btn btn-secundario"
              onClick={limpiarFiltros}
            >
              Limpiar
            </button>
          </div>
        </form>
      </div>

      {/* Tabla de Resultados */}
      <div className="tarjeta">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: 'var(--azul-oscuro)' }}>Registros de Actividad</h3>
          <span className="nota">Total: {total} registros</span>
        </div>

        {cargando ? (
          <p style={{ color: '#667', textAlign: 'center', padding: '20px' }}>Cargando registros...</p>
        ) : actividades.length === 0 ? (
          <p className="nota" style={{ textAlign: 'center', padding: '20px' }}>
            No se encontraron actividades con los filtros seleccionados.
          </p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Acción</th>
                  <th>Usuario</th>
                  <th>Módulo</th>
                  <th>Detalle</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {actividades.map((act) => (
                  <tr key={act.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatearFecha(act.creado_en)}</td>
                    <td>
                      <span className="etiqueta" style={{ fontWeight: 600 }}>
                        {act.accion}
                      </span>
                    </td>
                    <td>
                      {act.Usuario ? (
                        <span>
                          {act.Usuario.nombre}
                          <br />
                          <small style={{ color: '#778' }}>
                            {act.Usuario.email || act.Usuario.codigo}
                          </small>
                        </span>
                      ) : (
                        <span style={{ color: '#889' }}>Sistema / Anónimo</span>
                      )}
                    </td>
                    <td>{act.Modulo ? act.Modulo.nombre : '-'}</td>
                    <td>
                      {act.detalle || '-'}
                      {act.entidad && (
                        <small style={{ display: 'block', color: '#778' }}>
                          Entidad: {act.entidad} {act.entidad_id ? `(#${act.entidad_id})` : ''}
                        </small>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#556' }}>
                      {act.ip || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--gris-borde)',
            }}
          >
            <button
              className="btn btn-secundario"
              disabled={pagina <= 1 || cargando}
              onClick={() => setPagina((p) => p - 1)}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: '14px', color: '#556' }}>
              Página {pagina} de {totalPaginas}
            </span>
            <button
              className="btn btn-secundario"
              disabled={pagina >= totalPaginas || cargando}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
