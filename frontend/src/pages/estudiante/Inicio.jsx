import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

// '2026-10-05' -> '05/10/2026'; '18:00:00' -> '18:00'
const fechaLegible = (iso) => iso.split('-').reverse().join('/');
const horaLegible = (h) => h.slice(0, 5);

// Hora de la marca (fecha completa del servidor) mostrada en hora de La Paz.
const horaMarca = (iso) =>
  new Date(iso).toLocaleTimeString('es-BO', {
    timeZone: 'America/La_Paz',
    hour: '2-digit',
    minute: '2-digit',
  });

const ESTADOS = {
  PRESENTE: { texto: 'Presente', clase: 'etiqueta activa' },
  FALTA: { texto: 'Falta', clase: 'etiqueta falta' },
  PENDIENTE: { texto: 'Hoy', clase: 'etiqueta hoy' },
  PROXIMA: { texto: 'Próxima', clase: 'etiqueta' },
};

// Inicio del estudiante: marcar asistencia del día (RF-03) e historial
// personal con resumen (RF-04, RF-05).
export default function InicioEstudiante() {
  const { usuario } = useAuth();
  const [estadoHoy, setEstadoHoy] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    try {
      const [hoy, hist] = await Promise.all([
        client.get('/asistencia/hoy'),
        client.get('/asistencia/mis-asistencias'),
      ]);
      setEstadoHoy(hoy.data);
      setHistorial(hist.data);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo cargar tu asistencia'));
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function marcar() {
    setError('');
    setAviso('');
    setMarcando(true);
    try {
      const res = await client.post('/asistencia/marcar');
      setAviso(res.data.detalle);
      await cargar();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo registrar tu asistencia'));
      await cargar();
    } finally {
      setMarcando(false);
    }
  }

  const sesion = estadoHoy?.sesion;
  const marca = estadoHoy?.asistencia;

  return (
    <div className="pagina">
      <div className="tarjeta bienvenida">
        <h2>Hola, {usuario?.nombre}</h2>
        <p>Bienvenido/a al sistema de control de asistencia.</p>
        {usuario?.codigo && (
          <p className="dato">Número de registro: {usuario.codigo}</p>
        )}

        {error && <p className="error">{error}</p>}
        {aviso && <p className="exito">{aviso}</p>}

        {!estadoHoy ? (
          !error && <p className="nota">Cargando…</p>
        ) : (
          <>
            {sesion && (
              <p className="dato">
                📅 Clase de hoy: {fechaLegible(sesion.fecha)} ·{' '}
                {horaLegible(sesion.hora_inicio)}–{horaLegible(sesion.hora_fin)}
              </p>
            )}
            {marca ? (
              <p className="exito">
                {marca.estado === 'PRESENTE'
                  ? `✅ Marcaste asistencia a las ${horaMarca(marca.hora_registro)}`
                  : 'Tu asistencia de hoy figura como Falta'}
              </p>
            ) : (
              <>
                <button
                  className="btn btn-principal"
                  onClick={marcar}
                  disabled={!estadoHoy.puedeMarcar || marcando}
                >
                  {marcando ? 'Registrando…' : 'Marcar asistencia'}
                </button>
                {estadoHoy.motivo && <p className="nota">{estadoHoy.motivo}</p>}
              </>
            )}
          </>
        )}
      </div>

      {historial && (
        <div className="tarjeta historial">
          <h3>Mi historial</h3>
          <div className="resumen">
            <span>
              Presentes: <strong>{historial.resumen.presentes}</strong>
            </span>
            <span>
              Faltas: <strong>{historial.resumen.faltas}</strong>
            </span>
            <span>
              Pendientes: <strong>{historial.resumen.pendientes}</strong>
            </span>
          </div>

          {historial.fechas.length === 0 ? (
            <p className="nota">Todavía no hay fechas de clase en el módulo.</p>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Horario</th>
                    <th>Estado</th>
                    <th>Hora de marca</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.fechas.map((f) => (
                    <tr key={f.id}>
                      <td>{fechaLegible(f.fecha)}</td>
                      <td>
                        {horaLegible(f.hora_inicio)}–{horaLegible(f.hora_fin)}
                      </td>
                      <td>
                        <span className={ESTADOS[f.estado].clase}>
                          {ESTADOS[f.estado].texto}
                        </span>
                      </td>
                      <td>{f.hora_registro ? horaMarca(f.hora_registro) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
