import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Button, Logo } from '../components/ui';
import { usePageTitle } from '../utils/format';

// Página de login con selector Estudiante / Administrador.
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  usePageTitle('Iniciar sesión');

  const [pestana, setPestana] = useState('estudiante'); // 'estudiante' | 'admin'
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [conError, setConError] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function cambiarPestana(nueva) {
    setPestana(nueva);
    setConError(false);
    setPassword('');
  }

  async function enviar(e) {
    e.preventDefault();
    setConError(false);
    setEnviando(true);
    try {
      const u = await login(identificador, pestana === 'admin' ? password : null);
      navigate(u.rol === 'ADMIN' ? '/admin' : '/estudiante', { replace: true });
    } catch (err) {
      setConError(true);
      toast.error(err.response?.data?.detalle || 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const clase = `input${conError ? ' invalido' : ''}`;

  return (
    <div className="login">
      <aside className="login-panel">
        <Logo />
        <div>
          <h2>Tu asistencia, registrada en un clic.</h2>
          <p>Marca tu presencia el día de clase y revisa tu historial del módulo en cualquier momento.</p>
          <div className="login-datos">
            <div>
              <strong>1 clic</strong>
              <span>para marcar</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>trazable</span>
            </div>
            <div>
              <strong>Excel</strong>
              <span>importa y exporta</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="login-form-lado">
        <form onSubmit={enviar} className="login-form">
          <div>
            <h1>Iniciar sesión</h1>
            <p className="texto-muted">Elige cómo quieres ingresar.</p>
          </div>

          <div className="segmentado" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={pestana === 'estudiante'}
              className={pestana === 'estudiante' ? 'activa' : ''}
              onClick={() => cambiarPestana('estudiante')}
            >
              Estudiante
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pestana === 'admin'}
              className={pestana === 'admin' ? 'activa' : ''}
              onClick={() => cambiarPestana('admin')}
            >
              Administrador
            </button>
          </div>

          {pestana === 'estudiante' ? (
            <label className="field">
              Correo o número de registro
              <span className="input-wrap">
                <User size={18} aria-hidden="true" />
                <input
                  className={clase}
                  type="text"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="ej. 220001 o est1@ejemplo.com"
                  autoFocus
                  required
                />
              </span>
              <span className="hint">Debes estar inscrito en el módulo activo.</span>
            </label>
          ) : (
            <>
              <label className="field">
                Correo
                <span className="input-wrap">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    className={clase}
                    type="email"
                    value={identificador}
                    onChange={(e) => setIdentificador(e.target.value)}
                    placeholder="admin@ejemplo.com"
                    autoFocus
                    required
                  />
                </span>
              </label>
              <label className="field">
                Contraseña
                <span className="input-wrap">
                  <Lock size={18} aria-hidden="true" />
                  <input
                    className={clase}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </span>
              </label>
            </>
          )}

          <Button type="submit" size="lg" block loading={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
            {!enviando && <ArrowRight size={18} aria-hidden="true" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
