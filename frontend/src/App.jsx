import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import StudentLayout from './layouts/StudentLayout';
import Login from './pages/Login';
import InicioEstudiante from './pages/estudiante/Inicio';
import Calendario from './pages/estudiante/Calendario';
import InicioAdmin from './pages/admin/Inicio';
import Modulos from './pages/admin/Modulos';
import ModuloGestion, { RedirigirDatos } from './pages/admin/ModuloGestion';
import Estudiantes from './pages/admin/Estudiantes';
import Asistencias from './pages/admin/Asistencias';
import Actividades from './pages/admin/Actividades';

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'var(--font)', fontSize: '14px' } }} />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute rol="ESTUDIANTE">
                <StudentLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/estudiante" element={<InicioEstudiante />} />
            <Route path="/estudiante/calendario" element={<Calendario />} />
          </Route>

          <Route
            element={
              <ProtectedRoute rol="ADMIN">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<InicioAdmin />} />
            <Route path="/admin/asistencias" element={<Asistencias />} />
            <Route path="/admin/modulos" element={<Modulos />} />
            <Route path="/admin/modulos/:id" element={<ModuloGestion />} />
            <Route path="/admin/modulos/:id/datos" element={<RedirigirDatos />} />
            <Route path="/admin/estudiantes" element={<Estudiantes />} />
            <Route path="/admin/actividades" element={<Actividades />} />
          </Route>

          {/* Cualquier otra ruta va al login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
