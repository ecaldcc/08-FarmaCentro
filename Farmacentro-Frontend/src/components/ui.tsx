import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/http';
import { formatDateTime, formatMoney } from '../utils/format';

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled,
  busy,
  onClick,
  small,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${small ? ' btn-small' : ''}`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? 'Procesando…' : children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}

/** Error message from an API error: generic text plus the request id to report it. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  let message = 'Ocurrió un error inesperado.';
  let details: string[] = [];
  if (error instanceof ApiError) {
    message = error.message;
    details = error.fields.map((f) => f.message);
  } else if (error instanceof Error) {
    message = error.message;
  }
  return (
    <div className="alert alert-error" role="alert">
      <strong>{message}</strong>
      {details.length > 0 && (
        <ul>
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal-header">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
              ×
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

/** Asks for the mandatory reason of a sensitive operation (min. 10 characters). */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  danger?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = reason.trim().length >= 10;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} disabled={!valid} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description}
      <Field label="Motivo (obligatorio)" hint="Mínimo 10 caracteres. Quedará en la bitácora.">
        {(id) => <textarea id={id} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <ErrorAlert error={error} />
    </Modal>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span className="money">{formatMoney(cents)}</span>;
}

export function DateTime({ value }: { value: string | null | undefined }) {
  return <span>{value ? formatDateTime(value) : '—'}</span>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span>
        {total} resultado{total === 1 ? '' : 's'} · página {page} de {pages}
      </span>
      <Button variant="secondary" small disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <Button variant="secondary" small disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Siguiente
      </Button>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Loading() {
  return <p className="loading">Cargando…</p>;
}
