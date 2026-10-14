import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Barra superior con nombre, rol y botón de cerrar sesión.
export default function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  async function cerrarSesion() {
    await logout();
    navigate('/login', { replace: true });
  }

  const rolTexto = usuario?.rol === 'ADMIN' ? 'Administrador' : 'Estudiante';

  return (
    <div className="app">
      <header className="barra">
        <span className="barra-titulo">Control de Asistencia</span>
        <div className="barra-derecha">
          <span className="barra-usuario">
            {usuario?.nombre} · {rolTexto}
          </span>
          <button className="btn btn-salir" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="contenido">{children}</main>
    </div>
  );
}
