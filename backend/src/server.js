// Punto de entrada del backend: crea la app Express, configura CORS,
// monta los routers bajo /api y expone el healthcheck.
const express = require('express');
const cors = require('cors');
const env = require('./config/env');

// Routers que deja listos el equipo (stubs vacíos por ahora).
const modulosRouter = require('./routers/modulos');
const importacionRouter = require('./routers/importacion');
const asistenciaRouter = require('./routers/asistencia');
const adminRouter = require('./routers/admin');
const actividadesRouter = require('./routers/actividades');
// El router de autenticación (login/logout/me) se añade en el paso de routers.

const app = express();

// Necesario para leer la IP real del cliente detrás del proxy de nginx.
app.set('trust proxy', true);

app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json());

// Healthcheck simple: verifica que el backend responde.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routers de la aplicación (todos bajo /api).
app.use('/api/modulos', modulosRouter);
app.use('/api/importacion', importacionRouter);
app.use('/api/asistencia', asistenciaRouter);
app.use('/api/admin', adminRouter);
app.use('/api/actividades', actividadesRouter);

// Ruta no encontrada.
app.use((req, res) => {
  res.status(404).json({ detalle: 'Recurso no encontrado' });
});

// Manejador de errores general: responde en español y en formato JSON uniforme.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const detalle =
    status === 500 ? 'Error interno del servidor' : err.message || 'Error';
  if (status === 500) {
    console.error(err);
  }
  res.status(status).json({ detalle });
});

// Solo levanta el servidor si se ejecuta directamente (no al importarlo en tests).
if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`Backend escuchando en el puerto ${env.port}`);
  });
}

module.exports = app;
