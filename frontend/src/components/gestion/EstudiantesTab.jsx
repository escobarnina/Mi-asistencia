import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { Button, Card, DataTable, EmptyState, Modal, Paginacion, Persona, Skeleton } from '../ui';
import { hoyODiaMes, mensajeDe } from '../../utils/format';
import ImportarModal from './ImportarModal';

const VACIO = { codigo: '', nombre: '', email: '' };

// Mensaje de un 409 de RN-02: el registro o el correo ya son de otra persona.
function errorDeCampo(mensaje) {
  if (/registro/i.test(mensaje)) return { codigo: mensaje };
  if (/correo/i.test(mensaje)) return { email: mensaje };
  return { general: mensaje };
}

// Pestaña "Estudiantes" de la gestión de un módulo.
export default function EstudiantesTab({ modulo, soloLectura, tieneAsistencias, refrescar, recarga }) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nuevoId, setNuevoId] = useState(null);

  const [formulario, setFormulario] = useState(null); // { id?, valores }
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [quitar, setQuitar] = useState(null); // { estudiante, asistencias? }
  const [quitando, setQuitando] = useState(false);
  const [importando, setImportando] = useState(false);

  // La búsqueda se aplica un instante después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      setConsulta((c) => {
        if (c !== texto) setPagina(1);
        return texto;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await client.get(`/modulos/${modulo.id}/estudiantes`, {
        params: { buscar: consulta.trim() || undefined, pagina },
      });
      setDatos(res.data);
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo cargar la lista de estudiantes'));
    } finally {
      setCargando(false);
    }
  }, [modulo.id, consulta, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar, recarga]);

  function abrirAgregar() {
    setErrores({});
    setFormulario({ valores: VACIO });
  }

  function abrirEditar(e) {
    setErrores({});
    setFormulario({ id: e.id, valores: { codigo: e.codigo || '', nombre: e.nombre, email: e.email } });
  }

  function validar(v) {
    const e = {};
    if (!v.codigo.trim()) e.codigo = 'Falta el número de registro';
    if (!v.nombre.trim()) e.nombre = 'Falta el nombre completo';
    if (!v.email.trim()) e.email = 'Falta el correo electrónico';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'El correo electrónico no es válido';
    return e;
  }

  async function guardar(evento) {
    evento.preventDefault();
    const invalidos = validar(formulario.valores);
    setErrores(invalidos);
    if (Object.keys(invalidos).length) return;

    setGuardando(true);
    try {
      const cuerpo = {
        codigo: formulario.valores.codigo.trim(),
        nombre: formulario.valores.nombre.trim(),
        email: formulario.valores.email.trim(),
      };
      if (formulario.id) {
        await client.put(`/modulos/${modulo.id}/estudiantes/${formulario.id}`, cuerpo);
        toast.success('Estudiante actualizado');
      } else {
        const res = await client.post(`/modulos/${modulo.id}/estudiantes`, cuerpo);
        setNuevoId(res.data.estudiante.id);
        setConsulta('');
        setTexto('');
        setPagina(1);
        toast.success('Estudiante agregado');
      }
      setFormulario(null);
      refrescar();
      cargar();
    } catch (e) {
      const mensaje = mensajeDe(e, 'No se pudo guardar el estudiante');
      if (e.response?.status === 409 || e.response?.status === 400) {
        const campo = errorDeCampo(mensaje);
        setErrores(campo);
        if (campo.general) toast.error(mensaje);
      } else {
        toast.error(mensaje);
      }
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitar(forzar) {
    setQuitando(true);
    try {
      await client.delete(`/modulos/${modulo.id}/estudiantes/${quitar.estudiante.id}`, {
        params: forzar ? { forzar: true } : undefined,
      });
      toast.success('Estudiante quitado del módulo');
      setQuitar(null);
      refrescar();
      cargar();
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.requiere_forzar) {
        setQuitar((q) => ({ ...q, asistencias: e.response.data.asistencias }));
      } else {
        toast.error(mensajeDe(e, 'No se pudo quitar al estudiante'));
        setQuitar(null);
      }
    } finally {
      setQuitando(false);
    }
  }

  const campo = (clave, etiqueta, props = {}) => (
    <label className="field">
      {etiqueta}
      <input
        className={`input${errores[clave] ? ' invalido' : ''}`}
        value={formulario.valores[clave]}
        onChange={(e) => setFormulario({ ...formulario, valores: { ...formulario.valores, [clave]: e.target.value } })}
        aria-invalid={Boolean(errores[clave])}
        {...props}
      />
      {errores[clave] && <span className="field-error">{errores[clave]}</span>}
    </label>
  );

  const columnas = [
    {
      titulo: 'Estudiante',
      render: (e) => (
        <Persona nombre={e.nombre}>
          <strong style={{ fontWeight: 600 }}>{e.nombre}</strong>
          {e.id === nuevoId && <span className="chip-nuevo">Nuevo</span>}
        </Persona>
      ),
    },
    { titulo: 'Registro', render: (e) => e.codigo || '—' },
    { titulo: 'Correo', className: 'gris', render: (e) => e.email },
    {
      titulo: 'Agregado',
      className: 'gris',
      render: (e) => `${e.origen === 'MANUAL' ? 'Manual' : 'Excel'} · ${hoyODiaMes(e.agregado_en)}`,
    },
  ];
  if (!soloLectura) {
    columnas.push({
      titulo: 'Acciones',
      render: (e) => (
        <div className="acciones-fila">
          <button className="icon-btn-borde" aria-label={`Editar a ${e.nombre}`} title="Editar" onClick={() => abrirEditar(e)}>
            <Pencil size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-btn-borde peligro"
            aria-label={`Quitar a ${e.nombre}`}
            title="Quitar del módulo"
            onClick={() => setQuitar({ estudiante: e })}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      ),
    });
  }

  return (
    <Card>
      <div className="tab-barra">
        <span className="input-wrap">
          <Search size={16} aria-hidden="true" />
          <input
            className="input"
            aria-label="Buscar estudiante"
            placeholder="Buscar por nombre, registro o correo"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={100}
          />
        </span>
        {!soloLectura && (
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImportando(true)}>
              Importar Excel
            </Button>
            <Button icon={Plus} onClick={abrirAgregar}>
              Agregar estudiante
            </Button>
          </>
        )}
      </div>

      {!datos ? (
        <Skeleton filas={6} />
      ) : (
        <div style={{ opacity: cargando ? 0.6 : 1 }}>
          <DataTable
            filas={datos.estudiantes}
            rowKey={(e) => e.id}
            rowClass={(e) => (e.id === nuevoId ? 'fila-nueva' : '')}
            empty={
              <EmptyState
                icon={Users}
                title={consulta ? 'Sin resultados' : 'Aún no hay estudiantes'}
                text={consulta ? 'Ningún estudiante coincide con la búsqueda.' : 'Agrega estudiantes a mano o importa un Excel.'}
              />
            }
            columnas={columnas}
          />
          <Paginacion
            pagina={datos.pagina}
            totalPaginas={datos.totalPaginas}
            total={datos.total}
            limite={datos.limite}
            deshabilitado={cargando}
            onChange={setPagina}
          />
        </div>
      )}

      <Modal
        open={Boolean(formulario)}
        icon={UserPlus}
        title={formulario?.id ? 'Editar estudiante' : 'Agregar estudiante'}
        text={formulario?.id ? undefined : `Se inscribe en ${modulo.nombre}.`}
        onClose={() => !guardando && setFormulario(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setFormulario(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-estudiante" loading={guardando}>
              {formulario?.id ? 'Guardar cambios' : 'Agregar estudiante'}
            </Button>
          </>
        }
      >
        {formulario && (
          <form id="form-estudiante" onSubmit={guardar} noValidate className="modal-contenido" style={{ marginBottom: 0 }}>
            {campo('codigo', 'Número de registro', { maxLength: 20, autoFocus: true })}
            {campo('nombre', 'Nombre completo', { maxLength: 120 })}
            {campo('email', 'Correo electrónico', { maxLength: 150, type: 'email' })}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(quitar)}
        icon={Trash2}
        title={quitar?.asistencias ? 'Este estudiante tiene asistencias' : '¿Quitar del módulo?'}
        text={
          quitar?.asistencias
            ? `Este estudiante tiene ${quitar.asistencias} ${quitar.asistencias === 1 ? 'asistencia' : 'asistencias'}. Se quitará de la lista pero su historial se conserva.`
            : quitar && `${quitar.estudiante.nombre} dejará de estar inscrito en ${modulo.nombre}. Su usuario no se borra.`
        }
        onClose={() => !quitando && setQuitar(null)}
        buttons={
          <>
            <Button variant="secondary" onClick={() => setQuitar(null)} disabled={quitando}>
              Cancelar
            </Button>
            <Button variant="danger" loading={quitando} onClick={() => confirmarQuitar(Boolean(quitar?.asistencias))}>
              {quitar?.asistencias ? 'Quitar de todos modos' : 'Quitar'}
            </Button>
          </>
        }
      />

      {importando && (
        <ImportarModal
          tipo="estudiantes"
          modulo={modulo}
          tieneAsistencias={tieneAsistencias}
          total={Number(modulo.inscritos)}
          onClose={() => setImportando(false)}
          onImportado={() => {
            setPagina(1);
            refrescar();
            cargar();
          }}
        />
      )}
    </Card>
  );
}
