// Inicio del administrador: tarjetas marcadoras de las funciones que vienen.
const TARJETAS = [
  { titulo: 'Estudiantes', descripcion: 'Gestión e importación de estudiantes.' },
  { titulo: 'Asistencias', descripcion: 'Ver y corregir asistencias.' },
  { titulo: 'Actividades', descripcion: 'Historial de acciones del sistema.' },
  { titulo: 'Activar módulo', descripcion: 'Definir el módulo activo.' },
];

export default function InicioAdmin() {
  return (
    <div className="pagina">
      <h2>Panel del administrador</h2>
      <div className="grilla">
        {TARJETAS.map((t) => (
          <div className="tarjeta marcador" key={t.titulo}>
            <h3>{t.titulo}</h3>
            <p>{t.descripcion}</p>
            <span className="nota">Disponible próximamente</span>
          </div>
        ))}
      </div>
    </div>
  );
}
