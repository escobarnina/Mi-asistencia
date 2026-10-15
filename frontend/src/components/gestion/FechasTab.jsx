import { useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, Lock, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { Button, Card, DataTable, EmptyState, Modal, Skeleton, StatusBadge } from '../ui';
import {
  claveMes,
  cuentaSemanal,
  etiquetaMes,
  fechaLegible,
  horaLegible,
  mensajeDe,
  nombreDia,
} from '../../utils/format';
import ImportarModal from './ImportarModal';

const ESTADO_FECHA = { DICTADA: 'FECHA_DICTADA', HOY: 'FECHA_HOY', PROXIMA: 'FECHA_PROXIMA' };
const VACIO = { fecha: '', hora_inicio: '18:00', hora_fin: '21:00', repetir: false, hasta: '' };

// Pestaña "Fechas de clase" de la gestión de un módulo.
// Las fechas las carga la página de gestión (`sesiones`) y se refrescan con `refrescar`.
export default function FechasTab({ modulo, sesiones, soloLectura, tieneAsistencias, refrescar }) {
  const [mes, setMes] = useState('');
  const [formulario, setFormulario] = useState(null); // { id?, bloqueada?, valores }
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [quitar, setQuitar] = useState(null);
  const [quitando, setQuitando] = useState(false);
  const [importando, setImportando] = useState(false);

  const meses = useMemo(() => [...new Set((sesiones || []).map((s) => claveMes(s.fecha)))], [sesiones]);
  const visibles = (sesiones || []).filter((s) => !mes || claveMes(s.fecha) === mes);

  const v = formulario?.valores;
  const cantidad = v?.repetir && !formulario?.id ? cuentaSemanal(v.fecha, v.hasta) : 1;

  function abrirAgregar() {
    setErrores({});
    setFormulario({ valores: VACIO });
  }

  function abrirEditar(s) {
    setErrores({});
    setFormulario({
      id: s.id,
      bloqueada: s.tiene_asistencias,
      valores: {
        fecha: s.fecha,
        hora_inicio: horaLegible(s.hora_inicio),
        hora_fin: horaLegible(s.hora_fin),
        repetir: false,
        hasta: '',
      },
    });
  }

  function validar(valores) {
    const e = {};
    if (!valores.fecha) e.fecha = 'Falta la fecha';
    if (!valores.hora_inicio) e.hora_inicio = 'Falta la hora de inicio';
    if (!valores.hora_fin) e.hora_fin = 'Falta la hora de fin';
    else if (valores.hora_inicio && valores.hora_fin <= valores.hora_inicio) {
      e.hora_fin = 'La hora de fin debe ser posterior a la de inicio';
    }
    if (valores.repetir && !formulario.id) {
      if (!valores.hasta) e.hasta = 'Elige hasta cuándo se repite';
      else if (valores.hasta < valores.fecha) e.hasta = 'No puede ser anterior a la fecha inicial';
    }
    return e;
  }

  async function guardar(evento) {
    evento.preventDefault();
    const invalidos = validar(formulario.valores);
    setErrores(invalidos);
    if (Object.keys(invalidos).length) return;

    setGuardando(true);
    try {
      const cuerpo = { fecha: v.fecha, hora_inicio: v.hora_inicio, hora_fin: v.hora_fin };
      if (formulario.id) {
        await client.put(`/modulos/${modulo.id}/sesiones/${formulario.id}`, cuerpo);
        toast.success('Fecha actualizada');
      } else {
        if (v.repetir) cuerpo.repetir_semanal_hasta = v.hasta;
        const res = await client.post(`/modulos/${modulo.id}/sesiones`, cuerpo);
        const n = res.data.creadas.length;
        const omitidas = res.data.omitidas.length;
        toast.success(
          `${n} ${n === 1 ? 'fecha agregada' : 'fechas agregadas'}` +
            (omitidas ? ` · ${omitidas} ya existían y se omitieron` : '')
        );
      }
      setFormulario(null);
      refrescar();
    } catch (e) {
      const mensaje = mensajeDe(e, 'No se pudo guardar la fecha');
      setErrores(/clase el|fecha/i.test(mensaje) && !/asistencias/i.test(mensaje) ? { fecha: mensaje } : {});
      toast.error(mensaje);
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitar() {
    setQuitando(true);
    try {
      await client.delete(`/modulos/${modulo.id}/sesiones/${quitar.id}`);
      toast.success('Fecha quitada');
      setQuitar(null);
      refrescar();
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo quitar la fecha'));
      setQuitar(null);
    } finally {
      setQuitando(false);
    }
  }

  const cambiar = (clave, valor) => setFormulario({ ...formulario, valores: { ...v, [clave]: valor } });

  const columnas = [
    { titulo: 'Fecha', render: (s) => <strong>{fechaLegible(s.fecha)}</strong> },
    { titulo: 'Día', className: 'gris', render: (s) => nombreDia(s.fecha) },
    { titulo: 'Horario', render: (s) => `${horaLegible(s.hora_inicio)} – ${horaLegible(s.hora_fin)}` },
    { titulo: 'Estado', render: (s) => <StatusBadge estado={ESTADO_FECHA[s.estado_fecha]} /> },
  ];
  if (!soloLectura) {
    columnas.push({
      titulo: 'Acciones',
      render: (s) => (
        <div className="acciones-fila">
          <button className="icon-btn-borde" aria-label={`Editar la fecha ${fechaLegible(s.fecha)}`} title="Editar" onClick={() => abrirEditar(s)}>
            <Pencil size={16} aria-hidden="true" />
          </button>
          {s.tiene_asistencias ? (
            <button
              className="icon-btn-borde"
              disabled
              aria-label="Tiene asistencias registradas: no se puede quitar"
              title="Tiene asistencias registradas"
            >
              <Lock size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="icon-btn-borde peligro"
              aria-label={`Quitar la fecha ${fechaLegible(s.fecha)}`}
              title="Quitar fecha"
              onClick={() => setQuitar(s)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ),
    });
  }

  return (
    <Card>
      <div className="tab-barra">
        <select className="select" aria-label="Filtrar por mes" value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {etiquetaMes(m)}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        {!soloLectura && (
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImportando(true)}>
              Importar Excel
            </Button>
            <Button icon={Plus} onClick={abrirAgregar}>
              Agregar fecha
            </Button>
          </>
        )}
      </div>

      {!sesiones ? (
        <Skeleton filas={5} />
      ) : (
        <DataTable
          filas={visibles}
          rowKey={(s) => s.id}
          empty={
            <EmptyState
              icon={CalendarDays}
              title={mes ? 'Sin fechas en este mes' : 'Aún no hay fechas de clase'}
              text={mes ? 'Elige otro mes o quita el filtro.' : 'Agrega fechas a mano o importa un Excel.'}
            />
          }
          columnas={columnas}
        />
      )}

      <Modal
        open={Boolean(formulario)}
        icon={CalendarPlus}
        title={formulario?.id ? 'Editar fecha de clase' : 'Agregar fecha de clase'}
        text={
          formulario?.bloqueada
            ? 'Esta fecha ya tiene asistencias: solo puedes cambiar su horario.'
            : formulario?.id
              ? undefined
              : `Se agrega a ${modulo.nombre}. Puedes editarla después.`
        }
        onClose={() => !guardando && setFormulario(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setFormulario(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-fecha" loading={guardando} disabled={Boolean(v?.repetir) && cantidad === 0}>
              {formulario?.id ? 'Guardar cambios' : cantidad > 1 ? `Agregar ${cantidad} fechas` : 'Agregar fecha'}
            </Button>
          </>
        }
      >
        {formulario && (
          <form id="form-fecha" onSubmit={guardar} noValidate className="modal-contenido" style={{ marginBottom: 0 }}>
            <label className="field">
              Fecha
              <input
                className={`input${errores.fecha ? ' invalido' : ''}`}
                type="date"
                lang="es"
                value={v.fecha}
                disabled={formulario.bloqueada}
                onChange={(e) => cambiar('fecha', e.target.value)}
                autoFocus={!formulario.bloqueada}
              />
              {errores.fecha && <span className="field-error">{errores.fecha}</span>}
            </label>
            <div className="dos-cols">
              <label className="field">
                Hora inicio
                <input
                  className={`input${errores.hora_inicio ? ' invalido' : ''}`}
                  type="time"
                  value={v.hora_inicio}
                  onChange={(e) => cambiar('hora_inicio', e.target.value)}
                />
                {errores.hora_inicio && <span className="field-error">{errores.hora_inicio}</span>}
              </label>
              <label className="field">
                Hora fin
                <input
                  className={`input${errores.hora_fin ? ' invalido' : ''}`}
                  type="time"
                  value={v.hora_fin}
                  onChange={(e) => cambiar('hora_fin', e.target.value)}
                />
                {errores.hora_fin && <span className="field-error">{errores.hora_fin}</span>}
              </label>
            </div>
            {!formulario.id && (
              <div>
                <div className="check-fila">
                  <input
                    id="repetir"
                    type="checkbox"
                    checked={v.repetir}
                    onChange={(e) => cambiar('repetir', e.target.checked)}
                  />
                  <label htmlFor="repetir">Repetir cada semana hasta</label>
                  <input
                    className={`input${errores.hasta ? ' invalido' : ''}`}
                    type="date"
                    lang="es"
                    aria-label="Repetir hasta"
                    value={v.hasta}
                    min={v.fecha || undefined}
                    disabled={!v.repetir}
                    onChange={(e) => cambiar('hasta', e.target.value)}
                  />
                  {v.repetir && cantidad > 0 && (
                    <span className="texto-muted">
                      ({cantidad} {cantidad === 1 ? 'fecha' : 'fechas'})
                    </span>
                  )}
                </div>
                {errores.hasta && <span className="field-error">{errores.hasta}</span>}
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(quitar)}
        icon={Trash2}
        title="¿Quitar esta fecha?"
        text={quitar && `La clase del ${fechaLegible(quitar.fecha)} dejará de estar en ${modulo.nombre}.`}
        onClose={() => !quitando && setQuitar(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setQuitar(null)} disabled={quitando}>
              Cancelar
            </Button>
            <Button variant="danger" loading={quitando} onClick={confirmarQuitar}>
              Quitar
            </Button>
          </>
        }
      />

      {importando && (
        <ImportarModal
          tipo="fechas"
          modulo={modulo}
          tieneAsistencias={tieneAsistencias}
          total={Number(modulo.fechas)}
          onClose={() => setImportando(false)}
          onImportado={() => {
            refrescar();
          }}
        />
      )}
    </Card>
  );
}
