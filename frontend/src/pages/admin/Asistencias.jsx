import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

const FECHA_HOY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

function estadoVisible(estado) {
  if (estado === 'PRESENTE') return 'Presente';
  if (estado === 'FALTA') return 'Falta';
  return 'Pendiente';
}

export default function Asistencias() {
  const [fecha, setFecha] = useState(FECHA_HOY);
  const [estudiante, setEstudiante] = useState('');
  const [filtros, setFiltros] = useState({ fecha: FECHA_HOY, estudiante: '' });
  const [sesiones, setSesiones] = useState([]);
  const [modulo, setModulo] = useState(null);
  const [totales, setTotales] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [accion, setAccion] = useState('');

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    client
      .get('/admin/asistencias', {
        params: {
          fecha: filtros.fecha || undefined,
          estudiante: filtros.estudiante.trim() || undefined,
        },
      })
      .then((res) => {
        if (!vigente) return;
        setModulo(res.data.modulo);
        setSesiones(res.data.sesiones);
        setTotales(res.data.totales);
      })
      .catch((e) => {
        if (vigente) setError(mensajeDe(e, 'No se pudieron cargar las asistencias'));
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
    setAviso('');
    setFiltros({ fecha, estudiante });
  }

  async function exportar() {
    setError('');
    setAviso('');
    setAccion('exportar');
    try {
      const res = await client.get('/admin/asistencias/exportar', {
        params: {
          fecha: filtros.fecha || undefined,
          estudiante: filtros.estudiante.trim() || undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `asistencias-${filtros.fecha || FECHA_HOY}.xlsx`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      setAviso('La exportación a Excel se descargó correctamente.');
    } catch (e) {
      setError(mensajeDe(e, 'No se pudieron exportar las asistencias'));
    } finally {
      setAccion('');
    }
  }

  async function guardarCorreccion(evento) {
    evento.preventDefault();
    if (!edicion) return;
    setError('');
    setAviso('');
    setGuardando(true);
    try {
      await client.put(
        `/admin/asistencias/${edicion.sesionId}/${edicion.estudianteId}`,
        { estado: edicion.estado, motivo: edicion.motivo }
      );
      setAviso('Asistencia corregida.');
      setEdicion(null);
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo corregir la asistencia'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pagina">
      <Link to="/admin" className="volver">
        ← Volver al panel
      </Link>
      <h2>Asistencias</h2>
      {modulo && <p className="nota">Módulo activo: {modulo.nombre}</p>}
      {error && <p className="error">{error}</p>}
      {aviso && <p className="exito">{aviso}</p>}

      <form className="tarjeta filtros-asistencia" onSubmit={buscar}>
        <label className="campo">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <label className="campo">
          Estudiante
          <input
            value={estudiante}
            onChange={(e) => setEstudiante(e.target.value)}
            maxLength={100}
            placeholder="Nombre o número de registro"
          />
        </label>
        <button className="btn btn-principal btn-crear" type="submit">
          Buscar
        </button>
        <button
          className="btn btn-secundario"
          type="button"
          onClick={exportar}
          disabled={Boolean(accion)}
        >
          {accion === 'exportar' ? 'Exportando…' : 'Exportar a Excel'}
        </button>
      </form>

      {totales && !cargando && sesiones.length > 0 && (
        <div className="totales-asistencia" aria-label="Totales generales">
          <span>Presentes: {totales.presentes}</span>
          <span>Faltas: {totales.faltas}</span>
          <span>Pendientes: {totales.pendientes}</span>
        </div>
      )}

      {cargando ? (
        <p className="nota">Cargando asistencias…</p>
      ) : sesiones.length === 0 ? (
        <div className="tarjeta">
          <p className="nota">No hay sesiones de clase para los filtros seleccionados.</p>
        </div>
      ) : (
        sesiones.map((sesion) => (
          <section className="tarjeta bloque-sesion" key={sesion.id}>
            <div className="encabezado-sesion">
              <div>
                <h3>Sesión del {sesion.fecha}</h3>
                <p className="nota">Horario: {sesion.hora_inicio}–{sesion.hora_fin}</p>
              </div>
              <div className="totales-asistencia" aria-label="Totales de asistencia">
                <span>Presentes: {sesion.presentes}</span>
                <span>Faltas: {sesion.faltas}</span>
                <span>Pendientes: {sesion.pendientes}</span>
              </div>
            </div>
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Número de registro</th>
                    <th>Estudiante</th>
                    <th>Correo</th>
                    <th>Estado</th>
                    <th>Hora de marca</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sesion.asistencias.map((fila) => {
                    const seleccionada = edicion?.sesionId === sesion.id
                      && edicion?.estudianteId === fila.estudiante.id;
                    return (
                      <FragmentFila
                        key={`${sesion.id}-${fila.estudiante.id}`}
                        sesion={sesion}
                        fila={fila}
                        seleccionada={seleccionada}
                        edicion={edicion}
                        setEdicion={setEdicion}
                        guardarCorreccion={guardarCorreccion}
                        guardando={guardando}
                        estadoVisible={estadoVisible}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FragmentFila({
  sesion,
  fila,
  seleccionada,
  edicion,
  setEdicion,
  guardarCorreccion,
  guardando,
  estadoVisible,
}) {
  function iniciarCorreccion() {
    setEdicion({
      sesionId: sesion.id,
      estudianteId: fila.estudiante.id,
      estado: fila.estado === 'PRESENTE' ? 'FALTA' : 'PRESENTE',
      motivo: '',
    });
  }

  return (
    <>
      <tr>
        <td>{fila.estudiante.codigo || '—'}</td>
        <td>{fila.estudiante.nombre}</td>
        <td>{fila.estudiante.email}</td>
        <td>
          <span className={`etiqueta estado-${fila.estado.toLowerCase()}`}>
            {estadoVisible(fila.estado)}
          </span>
          {fila.automatica && <span className="nota"> (automática)</span>}
        </td>
        <td>{fila.hora_registro ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(fila.hora_registro)) : '—'}</td>
        <td>
          <button className="btn btn-secundario" type="button" onClick={iniciarCorreccion}>
            Corregir
          </button>
        </td>
      </tr>
      {seleccionada && (
        <tr>
          <td colSpan="6">
            <form className="form-correccion" onSubmit={guardarCorreccion}>
              <label className="campo">
                Nuevo estado
                <select
                  value={edicion.estado}
                  onChange={(e) => setEdicion({ ...edicion, estado: e.target.value })}
                >
                  <option value="PRESENTE">Presente</option>
                  <option value="FALTA">Falta</option>
                </select>
              </label>
              <label className="campo motivo-correccion">
                Motivo de la corrección
                <input
                  value={edicion.motivo}
                  onChange={(e) => setEdicion({ ...edicion, motivo: e.target.value })}
                  maxLength={255}
                  required
                />
              </label>
              <button className="btn btn-principal btn-crear" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar corrección'}
              </button>
              <button
                className="btn btn-secundario"
                type="button"
                onClick={() => setEdicion(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
