import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import InicioEstudiante from './pages/estudiante/Inicio';
import InicioAdmin from './pages/admin/Inicio';
import Modulos from './pages/admin/Modulos';
import Estudiantes from './pages/admin/Estudiantes';
import Actividades from './pages/admin/Actividades';
import Asistencias from './pages/admin/Asistencias';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/estudiante"
            element={
              <ProtectedRoute rol="ESTUDIANTE">
                <Layout>
                  <InicioEstudiante />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute rol="ADMIN">
                <Layout>
                  <InicioAdmin />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/asistencias"
            element={
              <ProtectedRoute rol="ADMIN">
                <Layout>
                  <Asistencias />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/modulos"
            element={
              <ProtectedRoute rol="ADMIN">
                <Layout>
                  <Modulos />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/estudiantes"
            element={
              <ProtectedRoute rol="ADMIN">
                <Layout>
                  <Estudiantes />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/actividades"
            element={
              <ProtectedRoute rol="ADMIN">
                <Layout>
                  <Actividades />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Cualquier otra ruta va al login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
