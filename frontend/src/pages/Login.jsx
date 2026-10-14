import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Página de login con dos pestañas: Estudiante y Administrador.
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [pestana, setPestana] = useState('estudiante'); // 'estudiante' | 'admin'
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function cambiarPestana(nueva) {
    setPestana(nueva);
    setError('');
    setPassword('');
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const u = await login(
        identificador,
        pestana === 'admin' ? password : null
      );
      navigate(u.rol === 'ADMIN' ? '/admin' : '/estudiante', { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.detalle || 'No se pudo iniciar sesión. Intenta de nuevo.'
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-fondo">
      <div className="login-tarjeta">
        <h1 className="login-titulo">Control de Asistencia</h1>

        <div className="pestanas">
          <button
            type="button"
            className={pestana === 'estudiante' ? 'pestana activa' : 'pestana'}
            onClick={() => cambiarPestana('estudiante')}
          >
            Estudiante
          </button>
          <button
            type="button"
            className={pestana === 'admin' ? 'pestana activa' : 'pestana'}
            onClick={() => cambiarPestana('admin')}
          >
            Administrador
          </button>
        </div>

        <form onSubmit={enviar} className="login-form">
          {pestana === 'estudiante' ? (
            <label className="campo">
              Correo o número de registro
              <input
                type="text"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="ej. 220001 o est1@ejemplo.com"
                autoFocus
                required
              />
            </label>
          ) : (
            <>
              <label className="campo">
                Correo
                <input
                  type="email"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="admin@ejemplo.com"
                  autoFocus
                  required
                />
              </label>
              <label className="campo">
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            </>
          )}

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn btn-principal" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
