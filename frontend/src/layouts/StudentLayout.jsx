import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CalendarDays, Home, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Button, Logo } from '../components/ui';

export default function StudentLayout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  async function cerrarSesion() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div>
      <header className="est-top">
        <div className="est-top-izq">
          <Logo />
          <nav className="est-tabs" aria-label="Secciones del estudiante">
            <NavLink to="/estudiante" end>
              <Home size={20} aria-hidden="true" /> Hoy
            </NavLink>
            <NavLink to="/estudiante/calendario">
              <CalendarDays size={20} aria-hidden="true" /> Mi calendario
            </NavLink>
          </nav>
        </div>
        <div className="est-quien">
          <div>
            {usuario?.nombre}
            {usuario?.codigo && <small>Registro {usuario.codigo}</small>}
          </div>
          <Avatar nombre={usuario?.nombre} large />
          <Button variant="secondary" icon={LogOut} onClick={cerrarSesion}>
            Salir
          </Button>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
