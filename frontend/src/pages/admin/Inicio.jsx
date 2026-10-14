import { Link } from 'react-router-dom';

// Inicio del administrador: tarjetas marcadoras de las funciones que vienen.
const TARJETAS = [
  {
    titulo: 'Estudiantes',
    descripcion: 'Importar estudiantes y fechas de clase desde Excel.',
    ruta: '/admin/estudiantes',
  },
  {
    titulo: 'Asistencias',
    descripcion: 'Consultar, corregir y exportar asistencias.',
    ruta: '/admin/asistencias',
  },
  {
    titulo: 'Actividades',
    descripcion: 'Historial de acciones del sistema.',
    ruta: '/admin/actividades',
  },
  {
    titulo: 'Módulos',
    descripcion: 'Crear módulos y definir el módulo activo.',
    ruta: '/admin/modulos',
  },
];

export default function InicioAdmin() {
  return (
    <div className="pagina">
      <h2>Panel del administrador</h2>
      <div className="grilla">
        {TARJETAS.map((t) =>
          t.ruta ? (
            <Link to={t.ruta} className="tarjeta marcador tarjeta-enlace" key={t.titulo}>
              <h3>{t.titulo}</h3>
              <p>{t.descripcion}</p>
              <span className="nota">Abrir →</span>
            </Link>
          ) : (
            <div className="tarjeta marcador" key={t.titulo}>
              <h3>{t.titulo}</h3>
              <p>{t.descripcion}</p>
              <span className="nota">Disponible próximamente</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
