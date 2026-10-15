import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, ClipboardCheck, Layers, History, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { Avatar, Logo, StatusBadge } from '../components/ui';
import { usePageTitle } from '../utils/format';

const ENLACES = [
  { to: '/admin', texto: 'Inicio', icono: Home, end: true },
  { to: '/admin/estudiantes', texto: 'Estudiantes', icono: Users },
  { to: '/admin/asistencias', texto: 'Asistencias', icono: ClipboardCheck },
  { to: '/admin/modulos', texto: 'Módulos', icono: Layers },
  { to: '/admin/actividades', texto: 'Actividad', icono: History },
];

function tituloDe(pathname) {
  if (pathname.startsWith('/admin/modulos/')) return 'Datos del módulo';
  if (pathname === '/admin/actividades') return 'Historial de actividad';
  const enlace = ENLACES.find((e) => (e.end ? pathname === e.to : pathname.startsWith(e.to)));
  return enlace ? (enlace.to === '/admin' ? 'Panel del administrador' : enlace.texto) : '';
}

const RF = {
  '/admin/estudiantes': 'RF-06',
  '/admin/asistencias': 'RF-08',
  '/admin/modulos': 'RF-13',
  '/admin/actividades': 'RF-10',
};

export default function AdminLayout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [modulo, setModulo] = useState(null);
  const [menu, setMenu] = useState(false);
  const titulo = tituloDe(pathname);
  usePageTitle(titulo);

  // Se vuelve a consultar al cambiar de pantalla para reflejar una activación.
  useEffect(() => {
    client
      .get('/modulos/activo')
      .then((res) => setModulo(res.data.modulo))
      .catch(() => setModulo(null));
    setMenu(false);
  }, [pathname]);

  async function cerrarSesion() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div>
      <div className={`scrim${menu ? ' abierta' : ''}`} onClick={() => setMenu(false)} />
      <aside className={`sidebar${menu ? ' abierta' : ''}`}>
        <Logo />
        <nav className="nav" aria-label="Principal">
          {ENLACES.map(({ to, texto, icono: Icono, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icono size={20} aria-hidden="true" /> {texto}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-pie">
          <Avatar nombre={usuario?.nombre} large />
          <div className="quien">
            {usuario?.nombre}
            <small>{usuario?.email}</small>
          </div>
          <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={cerrarSesion}>
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <div className="topbar-izq">
            <button className="icon-btn hamburguesa" aria-label="Abrir menú" onClick={() => setMenu(true)}>
              <Menu size={22} aria-hidden="true" />
            </button>
            <div>
              <div className="crumb">
                {[RF[pathname], modulo?.nombre].filter(Boolean).join(' · ') || 'MiAsistencia'}
              </div>
              <h1>{titulo}</h1>
            </div>
          </div>
          {modulo ? (
            <div className="capsula">
              <StatusBadge estado="ACTIVO" />
              <strong>{modulo.nombre}</strong>
              {modulo.gestion && <span className="gest">{modulo.gestion}</span>}
            </div>
          ) : (
            <div className="capsula capsula-gris">Sin módulo activo</div>
          )}
        </header>
        <main className="contenido">
          <Outlet context={{ modulo }} />
        </main>
      </div>
    </div>
  );
}
