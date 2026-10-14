import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

// Gestión de módulos (RF-13): lista, crea y activa. Solo uno puede estar activo.
export default function Modulos() {
  const [modulos, setModulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [gestion, setGestion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [activandoId, setActivandoId] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    try {
      const res = await client.get('/modulos');
      setModulos(res.data.modulos);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudieron cargar los módulos'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(evento) {
    evento.preventDefault();
    setError('');
    setAviso('');
    setEnviando(true);
    try {
      await client.post('/modulos', {
        nombre,
        gestion: gestion.trim() || null,
      });
      setNombre('');
      setGestion('');
      setAviso('Módulo creado. Quedó inactivo hasta que lo actives.');
      await cargar();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo crear el módulo'));
    } finally {
      setEnviando(false);
    }
  }

  async function activar(modulo) {
    const ok = window.confirm(
      `¿Activar "${modulo.nombre}"? El módulo actual se desactivará y solo ` +
        'podrán ingresar los estudiantes inscritos en el nuevo módulo.'
    );
    if (!ok) return;
    setError('');
    setAviso('');
    setActivandoId(modulo.id);
    try {
      await client.post(`/modulos/${modulo.id}/activar`);
      setAviso(`"${modulo.nombre}" es ahora el módulo activo.`);
      await cargar();
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo activar el módulo'));
    } finally {
      setActivandoId(null);
    }
  }

  return (
    <div className="pagina">
      <Link to="/admin" className="volver">
        ← Volver al panel
      </Link>
      <h2>Módulos</h2>

      {error && <p className="error">{error}</p>}
      {aviso && <p className="exito">{aviso}</p>}

      <form className="tarjeta form-modulo" onSubmit={crear}>
        <h3>Nuevo módulo</h3>
        <div className="fila-campos">
          <label className="campo">
            Nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={120}
              required
              placeholder="Ej.: Módulo 2"
            />
          </label>
          <label className="campo">
            Gestión
            <input
              value={gestion}
              onChange={(e) => setGestion(e.target.value)}
              maxLength={10}
              placeholder="Ej.: 1-2027"
            />
          </label>
          <button
            className="btn btn-principal btn-crear"
            disabled={enviando || !nombre.trim()}
          >
            {enviando ? 'Creando…' : 'Crear módulo'}
          </button>
        </div>
      </form>

      <div className="tarjeta tabla-contenedor">
        {cargando ? (
          <p className="nota">Cargando…</p>
        ) : modulos.length === 0 ? (
          <p className="nota">Todavía no hay módulos.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Gestión</th>
                <th>Inscritos</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {modulos.map((m) => (
                <tr key={m.id}>
                  <td>{m.nombre}</td>
                  <td>{m.gestion || '—'}</td>
                  <td>{m.inscritos}</td>
                  <td>
                    <span className={m.activo ? 'etiqueta activa' : 'etiqueta'}>
                      {m.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    {!m.activo && (
                      <button
                        className="btn btn-secundario"
                        disabled={activandoId !== null}
                        onClick={() => activar(m)}
                      >
                        {activandoId === m.id ? 'Activando…' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
