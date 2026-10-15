import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { Button, Card, DataTable, EmptyState, FileDropzone, Persona, Skeleton } from '../../components/ui';
import { fechaLegible, horaLegible, mensajeDe, usePageTitle } from '../../utils/format';

const ESTADOS = {
  NUEVO: { texto: 'Nuevo', clase: 'tag tag-ok' },
  EXISTENTE: { texto: 'Ya registrado', clase: 'tag' },
  YA_INSCRITO: { texto: 'Ya inscrito', clase: 'tag' },
};

// Configuración de cada tipo de importación (RF-11 y RF-12).
export const ESTUDIANTES = {
  titulo: 'Importar estudiantes',
  ruta: '/importacion/estudiantes',
  columnasExcel: 'Número de registro · Nombre completo · Correo electrónico',
  encabezados: ['Fila', 'Número de registro', 'Nombre', 'Correo', 'Estado'],
  celdas: (v) => [
    v.fila,
    v.codigo,
    v.nombre,
    v.email,
    <span className={ESTADOS[v.estado].clase}>{ESTADOS[v.estado].texto}</span>,
  ],
};

export const FECHAS = {
  titulo: 'Importar fechas de clase',
  ruta: '/importacion/fechas',
  columnasExcel: 'Fecha (DD/MM/AAAA) · Hora inicio · Hora fin',
  encabezados: ['Fila', 'Fecha', 'Hora inicio', 'Hora fin'],
  celdas: (v) => [v.fila, fechaLegible(v.fecha), horaLegible(v.hora_inicio), horaLegible(v.hora_fin)],
};

// Bloque de importación: elegir archivo -> Revisar (vista previa, RF-16)
// -> Confirmar carga. Si el archivo tiene errores se listan y no se guarda nada.
// `moduloId` importa a ese módulo (p. ej. uno nuevo aún inactivo); sin él, al módulo activo.
export function ImportarExcel({ config, hayModulo, moduloId, onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [inputKey, setInputKey] = useState(0); // para limpiar el <input type="file">
  const [revision, setRevision] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function enviar(url) {
    const datos = new FormData();
    if (moduloId) datos.append('modulo_id', String(moduloId));
    datos.append('archivo', archivo);
    return client.post(url, datos);
  }

  function elegir(f) {
    setArchivo(f);
    setRevision(null);
  }

  async function revisar() {
    setRevision(null);
    setRevisando(true);
    try {
      const res = await enviar(`${config.ruta}/revisar`);
      setRevision(res.data);
    } catch (e) {
      toast.error(mensajeDe(e, 'No se pudo revisar el archivo'));
    } finally {
      setRevisando(false);
    }
  }

  async function confirmar() {
    setGuardando(true);
    try {
      const res = await enviar(config.ruta);
      toast.success(res.data.detalle);
      if (onImportado) onImportado();
      setRevision(null);
      setArchivo(null);
      setInputKey((k) => k + 1);
    } catch (e) {
      // Si entre la revisión y el guardado aparecieron errores, se muestran.
      if (e.response?.data?.errores) {
        setRevision((r) => ({ ...r, validas: [], errores: e.response.data.errores }));
      }
      toast.error(mensajeDe(e, 'No se pudo importar el archivo'));
    } finally {
      setGuardando(false);
    }
  }

  const conErrores = revision && revision.errores.length > 0;

  return (
    <Card title={config.titulo}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="texto-muted">Columnas del Excel: {config.columnasExcel}</p>
        <FileDropzone archivo={archivo} onChange={elegir} inputKey={inputKey} />
        <div>
          <Button onClick={revisar} disabled={!archivo || guardando} loading={revisando}>
            {revisando ? 'Revisando…' : 'Revisar'}
          </Button>
        </div>
      </div>

      {conErrores && (
        <>
          <p className="card-body field-error" style={{ paddingTop: 0 }}>
            El archivo tiene {revision.errores.length} fila(s) con errores. Corrígelas en el Excel y vuelve a
            subirlo. No se guardó nada.
          </p>
          <DataTable
            filas={revision.errores}
            rowKey={(e) => e.fila}
            rowClass={() => 'fila-error'}
            columnas={[
              { titulo: 'Fila', render: (e) => e.fila },
              { titulo: 'Problema', render: (e) => e.mensaje },
            ]}
          />
        </>
      )}

      {revision && !conErrores && (
        <>
          <p className="card-body" style={{ color: 'var(--ok)', fontWeight: 600, paddingBottom: 0 }}>
            Archivo correcto: {revision.validas.length} fila(s) listas para cargar. Revisa la vista previa y
            confirma.
          </p>
          <DataTable
            filas={revision.validas}
            rowKey={(v) => v.fila}
            columnas={config.encabezados.map((h, i) => ({
              titulo: h,
              render: (v) => config.celdas(v)[i],
            }))}
          />
          <div className="card-body">
            {!hayModulo && (
              <p className="field-error" style={{ marginBottom: 10 }}>
                No hay un módulo activo. Activa uno antes de confirmar.
              </p>
            )}
            <Button onClick={confirmar} disabled={!hayModulo} loading={guardando}>
              {guardando ? 'Guardando…' : 'Confirmar carga'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

// RF-06: lista de estudiantes inscritos en el módulo activo, con buscador.
function ListaEstudiantes({ recarga }) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    let vigente = true;
    client
      .get('/admin/estudiantes', { params: { q: consulta.trim() || undefined } })
      .then((res) => {
        if (vigente) setDatos(res.data);
      })
      .catch((e) => {
        if (vigente) toast.error(mensajeDe(e, 'No se pudo cargar la lista de estudiantes'));
      });
    return () => {
      vigente = false;
    };
  }, [consulta, recarga]);

  function buscar(evento) {
    evento.preventDefault();
    setConsulta(texto);
  }

  return (
    <Card title="Estudiantes del módulo activo">
      <form className="filtros" onSubmit={buscar}>
        <span className="input-wrap">
          <Search size={16} aria-hidden="true" />
          <input
            className="input"
            aria-label="Buscar"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={100}
            placeholder="Nombre o número de registro"
          />
        </span>
        <Button type="submit">Buscar</Button>
        {consulta && (
          <Button
            variant="ghost"
            onClick={() => {
              setTexto('');
              setConsulta('');
            }}
          >
            Limpiar
          </Button>
        )}
      </form>
      {!datos ? (
        <Skeleton filas={5} />
      ) : !datos.modulo ? (
        <EmptyState icon={Users} title="Sin módulo activo" text="No hay un módulo activo." />
      ) : (
        <DataTable
          filas={datos.estudiantes}
          rowKey={(e) => e.id}
          empty={
            <EmptyState
              icon={Users}
              title={consulta ? 'Sin resultados' : 'Sin estudiantes'}
              text={consulta ? 'Ningún estudiante coincide con la búsqueda.' : 'Aún no hay estudiantes inscritos.'}
            />
          }
          columnas={[
            { titulo: 'Estudiante', render: (e) => <Persona nombre={e.nombre} /> },
            { titulo: 'Registro', className: 'mono', render: (e) => e.codigo || '—' },
            { titulo: 'Correo', className: 'gris', render: (e) => e.email },
          ]}
          footer={
            <div className="paginacion">
              <span>
                {datos.total} {datos.total === 1 ? 'estudiante' : 'estudiantes'}
                {consulta ? ' encontrados' : ' inscritos'}
              </span>
            </div>
          }
        />
      )}
    </Card>
  );
}

export default function Estudiantes() {
  usePageTitle('Estudiantes');
  const [modulo, setModulo] = useState(undefined); // undefined = cargando
  const [recarga, setRecarga] = useState(0); // refresca la lista tras importar

  useEffect(() => {
    client
      .get('/modulos/activo')
      .then((res) => setModulo(res.data.modulo))
      .catch(() => setModulo(null));
  }, []);

  return (
    <>
      {modulo === undefined ? (
        <Skeleton filas={1} />
      ) : modulo ? (
        <p className="texto-muted">
          Se importará al módulo activo: <strong>{modulo.nombre}</strong>
          {modulo.gestion ? ` (${modulo.gestion})` : ''}
        </p>
      ) : (
        <p className="field-error">
          No hay un módulo activo. Puedes revisar archivos, pero para guardarlos primero{' '}
          <Link to="/admin/modulos">activa un módulo</Link>.
        </p>
      )}

      <ListaEstudiantes recarga={recarga} />
      <ImportarExcel config={ESTUDIANTES} hayModulo={!!modulo} onImportado={() => setRecarga((n) => n + 1)} />
      <ImportarExcel config={FECHAS} hayModulo={!!modulo} />
    </>
  );
}
