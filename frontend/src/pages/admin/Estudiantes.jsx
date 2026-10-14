import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

// '2026-10-05' -> '05/10/2026'; '18:00:00' -> '18:00'
const fechaLegible = (iso) => iso.split('-').reverse().join('/');
const horaLegible = (h) => h.slice(0, 5);

const ESTADOS = {
  NUEVO: { texto: 'Nuevo', clase: 'etiqueta activa' },
  EXISTENTE: { texto: 'Ya registrado', clase: 'etiqueta' },
  YA_INSCRITO: { texto: 'Ya inscrito', clase: 'etiqueta' },
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
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  function enviar(url) {
    const datos = new FormData();
    if (moduloId) datos.append('modulo_id', String(moduloId));
    datos.append('archivo', archivo);
    return client.post(url, datos);
  }

  function elegir(e) {
    setArchivo(e.target.files[0] || null);
    setRevision(null);
    setError('');
    setAviso('');
  }

  async function revisar() {
    setError('');
    setAviso('');
    setRevision(null);
    setRevisando(true);
    try {
      const res = await enviar(`${config.ruta}/revisar`);
      setRevision(res.data);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo revisar el archivo'));
    } finally {
      setRevisando(false);
    }
  }

  async function confirmar() {
    setError('');
    setGuardando(true);
    try {
      const res = await enviar(config.ruta);
      setAviso(res.data.detalle);
      if (onImportado) onImportado();
      setRevision(null);
      setArchivo(null);
      setInputKey((k) => k + 1);
    } catch (e) {
      // Si entre la revisión y el guardado aparecieron errores, se muestran.
      if (e.response?.data?.errores) {
        setRevision((r) => ({ ...r, validas: [], errores: e.response.data.errores }));
      }
      setError(mensajeDe(e, 'No se pudo importar el archivo'));
    } finally {
      setGuardando(false);
    }
  }

  const conErrores = revision && revision.errores.length > 0;

  return (
    <div className="tarjeta form-modulo">
      <h3>{config.titulo}</h3>
      <p className="nota">Columnas del Excel: {config.columnasExcel}</p>

      <div className="fila-campos importar-controles">
        <input key={inputKey} type="file" accept=".xlsx" onChange={elegir} />
        <button
          className="btn btn-principal btn-crear"
          onClick={revisar}
          disabled={!archivo || revisando || guardando}
        >
          {revisando ? 'Revisando…' : 'Revisar'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {aviso && <p className="exito">{aviso}</p>}

      {conErrores && (
        <>
          <p className="error">
            El archivo tiene {revision.errores.length} fila(s) con errores. Corrígelas en el
            Excel y vuelve a subirlo. No se guardó nada.
          </p>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Problema</th>
                </tr>
              </thead>
              <tbody>
                {revision.errores.map((e) => (
                  <tr key={e.fila}>
                    <td>{e.fila}</td>
                    <td>{e.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {revision && !conErrores && (
        <>
          <p className="exito">
            Archivo correcto: {revision.validas.length} fila(s) listas para cargar. Revisa la
            vista previa y confirma.
          </p>
          <div className="tabla-contenedor vista-previa">
            <table className="tabla">
              <thead>
                <tr>
                  {config.encabezados.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revision.validas.map((v) => (
                  <tr key={v.fila}>
                    {config.celdas(v).map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hayModulo && (
            <p className="error">No hay un módulo activo. Activa uno antes de confirmar.</p>
          )}
          <button
            className="btn btn-principal btn-crear"
            onClick={confirmar}
            disabled={guardando || !hayModulo}
          >
            {guardando ? 'Guardando…' : 'Confirmar carga'}
          </button>
        </>
      )}
    </div>
  );
}

// Importación de estudiantes y fechas de clase al módulo activo.
// RF-06: lista de estudiantes inscritos en el módulo activo, con buscador.
function ListaEstudiantes({ recarga }) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setError('');
    client
      .get('/admin/estudiantes', { params: { q: consulta.trim() || undefined } })
      .then((res) => {
        if (vigente) setDatos(res.data);
      })
      .catch((e) => {
        if (vigente) setError(mensajeDe(e, 'No se pudo cargar la lista de estudiantes'));
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
    <div className="tarjeta lista-estudiantes">
      <h3>Lista de estudiantes del módulo activo</h3>
      <form className="filtros-asistencia" onSubmit={buscar}>
        <label className="campo">
          Buscar
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={100}
            placeholder="Nombre o número de registro"
          />
        </label>
        <button className="btn btn-principal btn-crear" type="submit">
          Buscar
        </button>
        {consulta && (
          <button
            className="btn btn-secundario"
            type="button"
            onClick={() => {
              setTexto('');
              setConsulta('');
            }}
          >
            Limpiar
          </button>
        )}
      </form>
      {error && <p className="error">{error}</p>}
      {!datos && !error && <p className="nota">Cargando estudiantes…</p>}
      {datos && !datos.modulo && <p className="nota">No hay un módulo activo.</p>}
      {datos && datos.modulo && (
        <>
          <p className="nota">
            {datos.total} {datos.total === 1 ? 'estudiante' : 'estudiantes'}
            {consulta ? ' encontrados' : ' inscritos'}
          </p>
          {datos.total === 0 ? (
            <p className="nota">
              {consulta ? 'Ningún estudiante coincide con la búsqueda.' : 'Aún no hay estudiantes inscritos.'}
            </p>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Número de registro</th>
                    <th>Nombre</th>
                    <th>Correo</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.estudiantes.map((e) => (
                    <tr key={e.id}>
                      <td>{e.codigo || '—'}</td>
                      <td>{e.nombre}</td>
                      <td>{e.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Estudiantes() {
  const [modulo, setModulo] = useState(undefined); // undefined = cargando
  const [recarga, setRecarga] = useState(0); // refresca la lista tras importar

  useEffect(() => {
    client
      .get('/modulos/activo')
      .then((res) => setModulo(res.data.modulo))
      .catch(() => setModulo(null));
  }, []);

  return (
    <div className="pagina">
      <Link to="/admin" className="volver">
        ← Volver al panel
      </Link>
      <h2>Estudiantes y fechas</h2>

      {modulo === undefined ? (
        <p className="nota">Cargando…</p>
      ) : modulo ? (
        <p className="nota modulo-destino">
          Se importará al módulo activo: <strong>{modulo.nombre}</strong>
          {modulo.gestion ? ` (${modulo.gestion})` : ''}
        </p>
      ) : (
        <p className="error modulo-destino">
          No hay un módulo activo. Puedes revisar archivos, pero para guardarlos primero{' '}
          <Link to="/admin/modulos">activa un módulo</Link>.
        </p>
      )}

      <ImportarExcel
        config={ESTUDIANTES}
        hayModulo={!!modulo}
        onImportado={() => setRecarga((n) => n + 1)}
      />
      <ImportarExcel config={FECHAS} hayModulo={!!modulo} />
      <ListaEstudiantes recarga={recarga} />
    </div>
  );
}
