import { useEffect, useState } from 'react';
import { CalendarDays, Check, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { Button, Card, EmptyState, Skeleton, StatusBadge } from '../../components/ui';
import {
  diaCorto,
  diaNombre,
  fechaLarga,
  horaLegible,
  horaMarca,
  hoyLaPaz,
  mensajeDe,
  porcentaje,
  usePageTitle,
} from '../../utils/format';

// Anillo de progreso con el % de asistencia.
function Anillo({ valor }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const lleno = valor === null ? 0 : (valor / 100) * c;
  return (
    <div className="anillo">
      <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--next-bg)" strokeWidth="10" />
        {lleno > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${lleno} ${c}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <span aria-label={valor === null ? 'Sin datos' : `${valor}% de asistencia`}>
        {valor === null ? '—' : `${valor}%`}
      </span>
    </div>
  );
}

// Inicio del estudiante: marcar asistencia del día (RF-03) e historial
// personal con resumen (RF-04, RF-05).
export default function InicioEstudiante() {
  const { usuario } = useAuth();
  usePageTitle('Mi asistencia');
  const [estadoHoy, setEstadoHoy] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [marcando, setMarcando] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function cargar() {
    try {
      const [hoy, hist] = await Promise.all([
        client.get('/asistencia/hoy'),
        client.get('/asistencia/mis-asistencias'),
      ]);
      setEstadoHoy(hoy.data);
      setHistorial(hist.data);
    } catch (e) {
      setFallo(true);
      toast.error(mensajeDe(e, 'No se pudo cargar tu asistencia'));
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function marcar() {
    setMarcando(true);
    try {
      await client.post('/asistencia/marcar');
      toast.success('Asistencia registrada');
      await cargar();
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo registrar tu asistencia'));
      await cargar();
    } finally {
      setMarcando(false);
    }
  }

  const sesion = estadoHoy?.sesion;
  const marca = estadoHoy?.asistencia;
  const hoy = estadoHoy?.fecha || hoyLaPaz();
  const proxima = historial?.fechas.find((f) => f.fecha > hoy);
  const resumen = historial?.resumen;
  const pct = resumen ? porcentaje(resumen.presentes, resumen.faltas) : null;
  const restantes = historial ? historial.fechas.filter((f) => f.fecha >= hoy && f.estado !== 'PRESENTE' && f.estado !== 'FALTA').length : 0;

  function claseHoy() {
    if (!estadoHoy) return null;
    if (sesion && marca) {
      return (
        <div className="card clase-hoy marcada">
          <div className="clase-hoy-cuerpo">
            <div className="marcada-linea">
              <CheckCircle2 size={28} aria-hidden="true" />
              {marca.estado === 'PRESENTE'
                ? `Asistencia registrada a las ${horaMarca(marca.hora_registro)}`
                : 'Tu asistencia de hoy figura como Falta'}
            </div>
            <span className="texto-muted">
              Clase de hoy · {horaLegible(sesion.hora_inicio)} – {horaLegible(sesion.hora_fin)}
            </span>
          </div>
        </div>
      );
    }
    if (sesion) {
      return (
        <Card title="Clase de hoy" className="clase-hoy" actions={<StatusBadge estado="PENDIENTE" />}>
          <div className="clase-hoy-cuerpo">
            <div className="horario-grande">
              {horaLegible(sesion.hora_inicio)} – {horaLegible(sesion.hora_fin)}
            </div>
            <p className="texto-muted">Puedes marcar hasta las 23:59 de hoy</p>
            {estadoHoy.puedeMarcar && (
              <Button size="lg" icon={Check} loading={marcando} onClick={marcar}>
                Marcar asistencia
              </Button>
            )}
            {!estadoHoy.puedeMarcar && estadoHoy.motivo && <p className="texto-muted">{estadoHoy.motivo}</p>}
          </div>
        </Card>
      );
    }
    return (
      <Card title="Clase de hoy" className="clase-hoy">
        <div className="clase-hoy-cuerpo">
          {/* RF-03: fuera de la fecha de clase el botón se ve, pero deshabilitado. */}
          <Button size="lg" icon={Check} disabled>
            Marcar asistencia
          </Button>
          <p className="texto-muted" role="status">
            {proxima
              ? `Hoy no hay clase. Tu próxima clase es el ${diaNombre(proxima.fecha)}`
              : 'Hoy no hay clase. No hay más clases programadas en este módulo.'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div>
        <p className="fecha-larga">{fechaLarga(hoy)}</p>
        <h2 className="saludo">Hola, {usuario?.nombre}</h2>
      </div>

      <div className="est-grid">
        {!estadoHoy ? (
          <Card title="Clase de hoy">{fallo ? <EmptyState title="No se pudo cargar" /> : <Skeleton filas={3} />}</Card>
        ) : (
          claseHoy()
        )}

        <Card title="Tu asistencia">
          {!historial ? (
            <Skeleton filas={5} />
          ) : (
            <>
              <div className="anillo-wrap">
                <Anillo valor={pct} />
                <div className="totales">
                  <div>
                    <strong>{resumen.presentes}</strong>Presentes
                  </div>
                  <div className="bad">
                    <strong>{resumen.faltas}</strong>Faltas
                  </div>
                  <div>
                    <strong>{restantes}</strong>Restantes
                  </div>
                </div>
              </div>
              {historial.fechas.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Sin fechas" text="Todavía no hay fechas de clase en el módulo." />
              ) : (
                <ul className="lista-fechas">
                  {historial.fechas.map((f) => (
                    <li key={f.id}>
                      <div>
                        {diaCorto(f.fecha)}
                        <small>{f.hora_registro ? `Marcó a las ${horaMarca(f.hora_registro)}` : 'Sin marca'}</small>
                      </div>
                      <StatusBadge estado={f.estado} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
