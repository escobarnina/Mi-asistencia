import { useEffect, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import { Button, DataTable, FileDropzone, Modal, ResultadoBadge } from '../ui';
import { fechaLegible, horaLegible, mensajeDe } from '../../utils/format';

const TIPOS = {
  estudiantes: {
    titulo: 'Importar estudiantes desde Excel',
    ruta: '/importacion/estudiantes',
    singular: 'estudiante',
    plural: 'estudiantes',
    columnasExcel: 'Número de registro · Nombre completo · Correo electrónico',
    columnas: [
      { titulo: 'Fila', render: (f) => f.fila },
      { titulo: 'Registro', render: (f) => f.codigo || '—' },
      { titulo: 'Nombre', render: (f) => f.nombre || '—' },
    ],
  },
  fechas: {
    titulo: 'Importar fechas de clase desde Excel',
    ruta: '/importacion/fechas',
    singular: 'fecha',
    plural: 'fechas',
    columnasExcel: 'Fecha (DD/MM/AAAA) · Hora inicio · Hora fin',
    columnas: [
      { titulo: 'Fila', render: (f) => f.fila },
      { titulo: 'Fecha', render: (f) => (f.fecha ? fechaLegible(f.fecha) : '—') },
      {
        titulo: 'Horario',
        render: (f) => (f.hora_inicio ? `${horaLegible(f.hora_inicio)} – ${horaLegible(f.hora_fin)}` : '—'),
      },
    ],
  },
};

// Importación por Excel de estudiantes o fechas: elegir archivo -> vista previa por fila
// -> confirmar. Si hay alguna fila con error no se importa nada (todo o nada, RF-11).
export default function ImportarModal({ tipo, modulo, tieneAsistencias, total, onClose, onImportado }) {
  const cfg = TIPOS[tipo];
  const [archivo, setArchivo] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [modo, setModo] = useState('AGREGAR');
  const [revision, setRevision] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function enviar(url) {
    const datos = new FormData();
    datos.append('modulo_id', String(modulo.id));
    datos.append('modo', modo);
    datos.append('archivo', archivo);
    return client.post(url, datos);
  }

  // Cada vez que cambia el archivo o el modo se vuelve a revisar (sin guardar nada).
  useEffect(() => {
    if (!archivo) {
      setRevision(null);
      return undefined;
    }
    let vigente = true;
    setRevisando(true);
    setRevision(null);
    const datos = new FormData();
    datos.append('modulo_id', String(modulo.id));
    datos.append('modo', modo);
    datos.append('archivo', archivo);
    client
      .post(`${cfg.ruta}/revisar`, datos)
      .then((res) => vigente && setRevision(res.data))
      .catch((e) => {
        if (!vigente) return;
        toast.error(mensajeDe(e, 'No se pudo revisar el archivo'));
        setArchivo(null);
        setInputKey((k) => k + 1);
      })
      .finally(() => vigente && setRevisando(false));
    return () => {
      vigente = false;
    };
  }, [archivo, modo, modulo.id, cfg.ruta]);

  async function confirmar() {
    setGuardando(true);
    try {
      const res = await enviar(cfg.ruta);
      toast.success(res.data.detalle);
      onImportado();
      onClose();
    } catch (e) {
      if (e.response?.data?.errores) {
        // Entre la revisión y el guardado aparecieron errores: se revisa de nuevo.
        setArchivo((a) => (a ? new File([a], a.name) : a));
      }
      toast.error(mensajeDe(e, 'No se pudo importar el archivo'));
    } finally {
      setGuardando(false);
    }
  }

  const resumen = revision?.resumen;
  const aImportar = resumen ? resumen.nuevos : 0;
  const conErrores = resumen ? resumen.errores > 0 : false;
  const puede = Boolean(revision) && !conErrores && (aImportar > 0 || modo === 'REEMPLAZAR');
  const etiquetaBoton =
    modo === 'REEMPLAZAR'
      ? `Reemplazar la lista (${aImportar})`
      : `Agregar ${aImportar} ${aImportar === 1 ? cfg.singular : cfg.plural}`;

  const columnas = [
    ...cfg.columnas,
    {
      titulo: 'Resultado',
      render: (f) =>
        f.resultado === 'ERROR' ? <span>{f.mensaje}</span> : <ResultadoBadge resultado={f.resultado} />,
    },
  ];

  return (
    <Modal
      size="lg"
      title={cfg.titulo}
      onClose={() => !guardando && onClose()}
      buttons={
        <div className="pie-modal" style={{ width: '100%' }}>
          <p>
            {conErrores
              ? 'Si hay filas con error no se importa nada: corrígelas en el Excel y vuelve a subir el archivo.'
              : `Columnas del Excel: ${cfg.columnasExcel}`}
          </p>
          <div className="acciones">
            <Button variant="secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button icon={Upload} onClick={confirmar} disabled={!puede || revisando} loading={guardando}>
              {etiquetaBoton}
            </Button>
          </div>
        </div>
      }
    >
      {archivo ? (
        <div className="archivo-card">
          <FileSpreadsheet size={22} color="var(--ok)" aria-hidden="true" />
          <div className="info">
            <strong>{archivo.name}</strong>
            <small>{revisando ? 'Revisando…' : revision ? `${revision.total} filas leídas` : ''}</small>
          </div>
          <button
            type="button"
            className="btn-texto"
            onClick={() => {
              setArchivo(null);
              setInputKey((k) => k + 1);
            }}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <FileDropzone archivo={null} onChange={setArchivo} inputKey={inputKey} />
      )}

      <div>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>
          ¿Qué hacer con la lista actual ({total} {total === 1 ? cfg.singular : cfg.plural})?
        </p>
        <div className="opciones-modo">
          <button
            type="button"
            className={`opcion-modo${modo === 'AGREGAR' ? ' activa' : ''}`}
            aria-pressed={modo === 'AGREGAR'}
            onClick={() => setModo('AGREGAR')}
          >
            <strong>Agregar a la lista</strong>
            <span>Suma los nuevos y omite los que ya están.</span>
          </button>
          <button
            type="button"
            className={`opcion-modo${modo === 'REEMPLAZAR' ? ' activa' : ''}`}
            aria-pressed={modo === 'REEMPLAZAR'}
            disabled={tieneAsistencias}
            title={tieneAsistencias ? 'El módulo ya tiene asistencias registradas' : undefined}
            onClick={() => setModo('REEMPLAZAR')}
          >
            <strong>Reemplazar la lista</strong>
            <span>
              {tieneAsistencias
                ? 'No disponible: el módulo ya tiene asistencias.'
                : 'Solo si el módulo aún no tiene asistencias.'}
            </span>
          </button>
        </div>
      </div>

      {resumen && (
        <>
          <div className={`mini-cards${tipo === 'fechas' ? ' dos' : ''}`}>
            <div className="ok">
              Nuevos
              <strong>{resumen.nuevos}</strong>
            </div>
            {tipo === 'estudiantes' && (
              <div>
                Ya inscritos (se omiten)
                <strong>{resumen.omitidos}</strong>
              </div>
            )}
            <div className={resumen.errores > 0 ? 'bad' : ''}>
              Con error
              <strong>{resumen.errores}</strong>
            </div>
          </div>
          <div className="vista-previa">
            <DataTable
              filas={revision.filas}
              rowKey={(f) => f.fila}
              rowClass={(f) => (f.resultado === 'ERROR' ? 'fila-error' : '')}
              columnas={columnas}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
