import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { puedeActivar, textoFaltante, mensajeConfirmacion } from '../../api/modulos';
import { ESTUDIANTES, FECHAS, ImportarExcel } from './Estudiantes';

function mensajeDe(error, porDefecto) {
  return error.response?.data?.detalle || porDefecto;
}

// Pasos 2 y 3 de un módulo nuevo (RF-13): cargar sus estudiantes y fechas con la
// vista previa de siempre (RF-16) y, cuando ya tiene ambos, activarlo.
export default function ModuloDatos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [modulo, setModulo] = useState(null);
  const [error, setError] = useState('');
  const [activando, setActivando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await client.get(`/modulos/${id}`);
      setModulo(res.data.modulo);
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo cargar el módulo'));
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function activar() {
    if (!window.confirm(mensajeConfirmacion(modulo))) return;
    setError('');
    setActivando(true);
    try {
      await client.post(`/modulos/${modulo.id}/activar`);
      navegar('/admin/modulos', { replace: true });
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo activar el módulo'));
      setActivando(false);
    }
  }

  if (!modulo) {
    return (
      <div className="pagina">
        <Link to="/admin/modulos" className="volver">
          ← Volver a módulos
        </Link>
        {error ? <p className="error">{error}</p> : <p className="nota">Cargando…</p>}
      </div>
    );
  }

  // Un módulo que ya estuvo activo es historia: sus datos no se modifican.
  const reemplazado = !modulo.activo && Boolean(modulo.activado_en);
  const hayEstudiantes = Number(modulo.inscritos) > 0;
  const hayFechas = Number(modulo.fechas) > 0;

  return (
    <div className="pagina">
      <Link to="/admin/modulos" className="volver">
        ← Volver a módulos
      </Link>
      <h2>
        {modulo.nombre}
        {modulo.gestion ? ` (${modulo.gestion})` : ''}
      </h2>

      <ol className="pasos-modulo">
        <li className="hecho">1. Módulo creado</li>
        <li className={hayEstudiantes ? 'hecho' : ''}>
          2a. Estudiantes: {modulo.inscritos}
        </li>
        <li className={hayFechas ? 'hecho' : ''}>2b. Fechas de clase: {modulo.fechas}</li>
        <li className={modulo.activo ? 'hecho' : ''}>
          3. {modulo.activo ? 'Módulo activo' : 'Activar'}
        </li>
      </ol>

      {error && <p className="error">{error}</p>}

      {reemplazado ? (
        <p className="nota modulo-destino">
          Este módulo ya se usó y fue reemplazado. Sus datos se conservan y no se pueden
          modificar.
        </p>
      ) : (
        <>
          <p className="nota modulo-destino">
            Los archivos se importan a <strong>{modulo.nombre}</strong>
            {modulo.activo ? ' (módulo activo)' : ' (todavía inactivo)'}. El módulo activo
            actual no se modifica hasta que actives este.
          </p>
          <ImportarExcel config={ESTUDIANTES} hayModulo moduloId={modulo.id} onImportado={cargar} />
          <ImportarExcel config={FECHAS} hayModulo moduloId={modulo.id} onImportado={cargar} />
        </>
      )}

      {!modulo.activo && (
        <div className="tarjeta form-modulo">
          <h3>Activar módulo</h3>
          {puedeActivar(modulo) ? (
            <p className="nota">
              Listo para activar: {modulo.inscritos} estudiantes y {modulo.fechas} fechas.
            </p>
          ) : (
            <p className="nota">{textoFaltante(modulo)}. Impórtalos para poder activarlo.</p>
          )}
          <button
            className="btn btn-principal btn-crear"
            onClick={activar}
            disabled={!puedeActivar(modulo) || activando}
          >
            {activando ? 'Activando…' : 'Activar módulo'}
          </button>
        </div>
      )}
    </div>
  );
}
