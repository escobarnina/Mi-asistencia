import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
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
        <Logo />
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
