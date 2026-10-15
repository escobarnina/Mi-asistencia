import { useEffect, useId } from 'react';
import { Inbox, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { ACCIONES } from '../../constants/acciones';
import { iniciales } from '../../utils/format';

export function Card({ title, actions, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <h3>{title}</h3>
          {actions && <div className="acciones">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  variant = 'primary',
  icon: Icon,
  loading = false,
  size,
  block,
  className = '',
  children,
  disabled,
  type = 'button',
  ...resto
}) {
  const clases = ['btn', `btn-${variant}`, size === 'lg' && 'btn-lg', block && 'btn-block', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={clases} disabled={disabled || loading} {...resto}>
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon && <Icon size={18} aria-hidden="true" />}
      {children}
    </button>
  );
}

const ESTADOS = {
  PRESENTE: ['Presente', 'badge-presente'],
  FALTA: ['Falta', 'badge-falta'],
  PENDIENTE: ['Pendiente', 'badge-pendiente'],
  PROXIMA: ['Próxima', 'badge-proxima'],
  ACTIVO: ['Activo', 'badge-activo'],
  INACTIVO: ['Inactivo', 'badge-inactivo'],
};

// Única forma de mostrar un estado en todo el sistema.
export function StatusBadge({ estado }) {
  const [texto, clase] = ESTADOS[estado] || [estado, 'badge-proxima'];
  return <span className={`badge ${clase}`}>{texto}</span>;
}

export function ActionTag({ accion }) {
  const def = ACCIONES[accion];
  const clase = def?.tipo ? ` tag-${def.tipo}` : '';
  return (
    <span className={`tag${clase}`} title={accion}>
      {def ? def.texto : accion}
    </span>
  );
}

export function StatCard({ icon: Icon, tono = '', label, value, sub, valueTone = '' }) {
  return (
    <div className="card stat">
      <div className={`stat-icon ${tono}`}>{Icon && <Icon size={20} aria-hidden="true" />}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className={`stat-value ${valueTone}`}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Avatar({ nombre, large }) {
  return (
    <span className={`avatar${large ? ' avatar-lg' : ''}`} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

export function Persona({ nombre, children }) {
  return (
    <span className="persona">
      <Avatar nombre={nombre} />
      <span>{children || nombre}</span>
    </span>
  );
}

export function Tabs({ tabs, activa, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={activa === t.id}
          className={`tab${activa === t.id ? ' activa' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FileDropzone({ archivo, onChange, accept = '.xlsx', inputKey }) {
  const id = useId();
  return (
    <div className="dropzone">
      <input
        key={inputKey}
        id={id}
        type="file"
        accept={accept}
        aria-label="Elegir archivo Excel"
        onChange={(e) => onChange(e.target.files[0] || null)}
      />
      {archivo ? (
        <span className="archivo">
          <FileSpreadsheet size={20} aria-hidden="true" /> {archivo.name} · listo para revisar
        </span>
      ) : (
        <>
          <UploadCloud size={28} aria-hidden="true" />
          <span>
            <strong>Arrastra tu archivo aquí</strong> o haz clic para elegirlo
          </span>
          <span className="hint">Solo archivos .xlsx</span>
        </>
      )}
    </div>
  );
}

export function Modal({ open = true, icon: Icon, title, text, onClose, buttons, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const alTeclear = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        {Icon && (
          <div className="modal-icono">
            <Icon size={22} aria-hidden="true" />
          </div>
        )}
        <h2>{title}</h2>
        {text && <p className="modal-texto">{text}</p>}
        {children && <div className="modal-contenido">{children}</div>}
        {buttons && <div className="modal-botones">{buttons}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, text }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={24} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}

export function Skeleton({ filas = 4 }) {
  return (
    <div className="skeleton-filas" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${95 - (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

// columnas: [{ titulo, render(fila), className }]
export function DataTable({ columnas, filas, rowKey, rowClass, empty, footer }) {
  if (filas.length === 0 && empty) return empty;
  return (
    <>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              {columnas.map((c, i) => (
                <th key={i}>{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={rowKey(f, i)} className={rowClass?.(f) || ''}>
                {columnas.map((c, j) => (
                  <td key={j} className={c.className || ''}>
                    {c.render(f, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </>
  );
}

export function Paginacion({ pagina, totalPaginas, total, limite, onChange, deshabilitado }) {
  const desde = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const hasta = Math.min(pagina * limite, total);
  const numeros = Array.from({ length: totalPaginas }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 1
  );
  return (
    <div className="paginacion">
      <span>
        Mostrando {desde}–{hasta} de {total}
      </span>
      {totalPaginas > 1 && (
        <div className="paginacion-botones">
          <Button variant="secondary" disabled={pagina <= 1 || deshabilitado} onClick={() => onChange(pagina - 1)}>
            Anterior
          </Button>
          {numeros.map((n) => (
            <Button
              key={n}
              variant="secondary"
              className={`pag-num${n === pagina ? ' activa' : ''}`}
              aria-current={n === pagina ? 'page' : undefined}
              disabled={deshabilitado}
              onClick={() => onChange(n)}
            >
              {n}
            </Button>
          ))}
          <Button
            variant="secondary"
            disabled={pagina >= totalPaginas || deshabilitado}
            onClick={() => onChange(pagina + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

export function Logo({ children = 'MiAsistencia' }) {
  return (
    <div className="logo">
      <span className="logo-icono">
        <CheckIcon />
      </span>
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}
