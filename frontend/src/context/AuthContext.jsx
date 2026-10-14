import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

// Guarda token y usuario en localStorage. Al cargar la app valida el token
// contra /api/auth/me.
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setCargando(false);
      return;
    }
    client
      .get('/auth/me')
      .then((res) => {
        setUsuario(res.data.usuario);
        localStorage.setItem('usuario', JSON.stringify(res.data.usuario));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        setUsuario(null);
      })
      .finally(() => setCargando(false));
  }, []);

  async function login(identificador, password) {
    const res = await client.post('/auth/login', {
      identificador,
      password: password || null,
    });
    const { access_token, usuario: u } = res.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('usuario', JSON.stringify(u));
    setUsuario(u);
    return u;
  }

  async function logout() {
    try {
      await client.post('/auth/logout');
    } catch (e) {
      // Si falla (p. ej. token ya expirado), igual limpiamos la sesión local.
    }
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
