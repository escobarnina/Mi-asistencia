import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

// Acciones en español legible. Los códigos son los que guarda el sistema.
const ACCIONES = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FALLIDO: 'Intento de ingreso fallido',
  MARCAR_ASISTENCIA: 'Marcó su asistencia',
  MODIFICAR_ASISTENCIA: 'Corrigió una asistencia',
  CORREGIR_ASISTENCIA: 'Corrigió una asistencia',
  GENERAR_FALTAS: 'Generó faltas',
  IMPORTAR_ESTUDIANTES: 'Importó estudiantes',
  IMPORTAR_FECHAS: 'Importó fechas de clase',
  ACTIVAR_MODULO: 'Activó un módulo',
  EXPORTAR: 'Exportó asistencias',
};

// Filtro de acciones: sin duplicados de nombre (CORREGIR_ASISTENCIA es un alias).
const ACCIONES_FILTRO = Object.keys(ACCIONES).filter((a) => a !== 'CORREGIR_ASISTENCIA');

const ENTIDADES = {
  asistencia: 'Asistencia',
  importacion: 'Importación',
  modulo: 'Módulo',
  sesion_clase: 'Clase',
};

function nombreAccion(accion) {
  return ACCIONES[accion] || accion;
}

// Registro afectado: "Asistencia #7". Sin entidad no hay registro afectado.
function registroAfectado(act) {
  if (!act.entidad) return null;
  const nombre = ENTIDADES[act.entidad.toLowerCase()] || act.entidad;
  return act.entidad_id ? `${nombre} #${act.entidad_id}` : nombre;
}

// Fecha y hora siempre en La Paz, sin importar la zona del navegador.
const FORMATO_FECHA = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function formatearFecha(fechaStr) {
  if (!fechaStr) return '-';
  return FORMATO_FECHA.format(new Date(fechaStr));
}

const LIMITE = 20;
const SIN_FILTROS = { estudiante: '', desde: '', hasta: '', accion: '' };

export default function Actividades() {
  const [actividades, setActividades] = useState([]);
  const [modulo, setModulo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // `formulario` es lo que se está escribiendo; `filtros` lo que se aplicó al buscar.
  const [formulario, setFormulario] = useState(SIN_FILTROS);
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
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
        setModulo(res.data.modulo);
        setActividades(res.data.actividades || []);
        setTotalPaginas(res.data.totalPaginas || 1);
        setTotal(res.data.total || 0);
      })
      .catch((e) => {
        if (vigente) setError(mensajeDe(e, 'No se pudo cargar el historial de actividades'));
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
    <div className="pagina">
      <Link to="/admin" className="volver">
        ← Volver al panel
      </Link>
      <h2>Historial de actividades</h2>
      {modulo ? (
        <p className="nota">
          Módulo activo: {modulo.nombre}
          {modulo.gestion ? ` (${modulo.gestion})` : ''}
        </p>
      ) : (
        !cargando && !error && <p className="nota">No hay un módulo activo.</p>
      )}

      {error && <p className="error">{error}</p>}

      <form className="tarjeta filtros-asistencia" onSubmit={aplicarFiltros}>
        <label className="campo">
          Estudiante
          <input
            value={formulario.estudiante}
            onChange={(e) => cambiar('estudiante', e.target.value)}
            maxLength={100}
            placeholder="Nombre o número de registro"
          />
        </label>
        <label className="campo">
          Desde
          <input
            type="date"
            value={formulario.desde}
            onChange={(e) => cambiar('desde', e.target.value)}
          />
        </label>
        <label className="campo">
          Hasta
          <input
            type="date"
            value={formulario.hasta}
            onChange={(e) => cambiar('hasta', e.target.value)}
          />
        </label>
        <label className="campo">
          Acción
          <select
            value={formulario.accion}
            onChange={(e) => cambiar('accion', e.target.value)}
            style={{ padding: '9px', borderRadius: '6px', border: '1px solid var(--gris-borde)' }}
          >
            <option value="">Todas las acciones</option>
            {ACCIONES_FILTRO.map((acc) => (
              <option key={acc} value={acc}>
                {nombreAccion(acc)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-principal btn-crear">
          Filtrar
        </button>
        <button type="button" className="btn btn-secundario" onClick={limpiarFiltros}>
          Limpiar
        </button>
      </form>

      <div className="tarjeta">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h3 style={{ margin: 0 }}>Registros de actividad</h3>
          <span className="nota">
            {total} {total === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {cargando ? (
          <p className="nota">Cargando registros…</p>
        ) : actividades.length === 0 ? (
          <p className="nota">
            {hayFiltros
              ? 'No se encontraron actividades con los filtros seleccionados.'
              : 'Todavía no hay actividades en el módulo activo.'}
          </p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Registro afectado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {actividades.map((act) => (
                  <tr key={act.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatearFecha(act.creado_en)}</td>
                    <td>
                      {act.Usuario ? (
                        <span>
                          {act.Usuario.nombre}
                          <small style={{ display: 'block' }} className="nota">
                            {act.Usuario.codigo || act.Usuario.email}
                          </small>
                        </span>
                      ) : (
                        <span className="nota">Sistema</span>
                      )}
                    </td>
                    <td>
                      <span className="etiqueta" style={{ fontWeight: 600 }}>
                        {nombreAccion(act.accion)}
                      </span>
                    </td>
                    <td>{registroAfectado(act) || '—'}</td>
                    <td>{act.detalle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
            <span className="nota">
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
