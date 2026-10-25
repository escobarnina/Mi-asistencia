import axios from 'axios';

// Cliente axios con baseURL /api. nginx (en producción) o Vite (en desarrollo)
// redirigen /api hacia el backend.
const client = axios.create({ baseURL: '/api' });

// Agrega el token de sesión (si existe) a cada petición.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el backend responde 401, se cierra la sesión y se vuelve al login.
client.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;
