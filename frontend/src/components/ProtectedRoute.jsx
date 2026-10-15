import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Protege una ruta: exige sesión y, opcionalmente, un rol.
// Si el rol no coincide, redirige al inicio que le corresponde al usuario.
export default function ProtectedRoute({ rol, children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return <div className="pad" aria-busy="true"><div className="skeleton" style={{ width: "40%" }} /></div>;
  }
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  if (rol && usuario.rol !== rol) {
    return (
      <Navigate to={usuario.rol === 'ADMIN' ? '/admin' : '/estudiante'} replace />
    );
  }
  return children;
}
