import { useState, type FormEvent } from 'react';
import { http } from '../../api/http';
import { Button, ErrorAlert, Field } from '../../components/ui';

export function ChangePasswordForm({ onDone }: { onDone: () => Promise<void> | void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const bytes = new TextEncoder().encode(next).length;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await http.post('/auth/password/change', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      await onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Contraseña actual">
        {(id) => (
          <input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
      </Field>
      <Field
        label="Nueva contraseña"
        hint="Mínimo 12 caracteres, sin tu nombre de usuario ni contraseñas comunes."
        error={bytes > 72 ? 'Es demasiado larga (máximo 72 bytes).' : undefined}
      >
        {(id) => <input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="Confirma la nueva contraseña" error={mismatch ? 'No coincide.' : undefined}>
        {(id) => (
          <input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </Field>
      <ErrorAlert error={error} />
      <Button type="submit" busy={busy} disabled={!current || next.length < 12 || next !== confirm || bytes > 72}>
        Guardar contraseña
      </Button>
    </form>
  );
}
