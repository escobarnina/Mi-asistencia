import { useAuth } from '../../context/AuthContext';

// Inicio del estudiante: bienvenida y botón de marcar asistencia (deshabilitado,
// lo implementa otro compañero).
export default function InicioEstudiante() {
  const { usuario } = useAuth();

  return (
    <div className="pagina">
      <div className="tarjeta bienvenida">
        <h2>Hola, {usuario?.nombre}</h2>
        <p>Bienvenido/a al sistema de control de asistencia.</p>
        {usuario?.codigo && (
          <p className="dato">Número de registro: {usuario.codigo}</p>
        )}
        <button className="btn btn-principal" disabled title="Disponible próximamente">
          Marcar asistencia
        </button>
        <p className="nota">Disponible próximamente</p>
      </div>
    </div>
  );
}
