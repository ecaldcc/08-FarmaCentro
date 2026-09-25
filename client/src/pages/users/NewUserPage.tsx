import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { http } from '../../api/http';
import { ROLE_LABELS, type Role, type UserDetail } from '../../api/types';
import { useStepUp } from '../../auth/StepUp';
import { Alert, Button, ErrorAlert, Field, PageHeader } from '../../components/ui';

/** A2 — New user. The temporary password is shown only once. */
export function NewUserPage() {
  const { withStepUp } = useStepUp();
  const [form, setForm] = useState({ username: '', fullName: '', email: '', role: 'cajero' as Role });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<{ user: UserDetail; temporaryPassword: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await withStepUp({ action: 'user.create', targetId: null, label: 'Crear usuario' }, () =>
        http.post<{ user: UserDetail; temporaryPassword: string }>('/users', {
          ...form,
          username: form.username.trim().toLowerCase(),
        }),
      );
      setCreated(result);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <>
        <PageHeader title="Usuario creado" />
        <section className="card narrow">
          <Alert kind="warning">
            Copia ahora la contraseña temporal: no se volverá a mostrar. El usuario deberá cambiarla al iniciar sesión.
          </Alert>
          <dl className="details">
            <dt>Usuario</dt>
            <dd>{created.user.username}</dd>
            <dt>Rol</dt>
            <dd>{ROLE_LABELS[created.user.role]}</dd>
            <dt>Contraseña temporal</dt>
            <dd>
              <code className="secret">{created.temporaryPassword}</code>
            </dd>
          </dl>
          <Link to={`/usuarios/${created.user.id}`} className="btn btn-primary">
            Ver usuario
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nuevo usuario" subtitle="Asignar un rol requiere confirmar tu identidad" />
      <form className="card narrow stack" onSubmit={submit}>
        <Field label="Usuario" hint="3 a 32 caracteres: minúsculas, números, punto, guion o guion bajo.">
          {(id) => (
            <input id={id} value={form.username} maxLength={32} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          )}
        </Field>
        <Field label="Nombre completo">
          {(id) => (
            <input id={id} value={form.fullName} maxLength={100} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          )}
        </Field>
        <Field label="Correo" hint="Recibirá los códigos de verificación y los avisos de seguridad.">
          {(id) => (
            <input id={id} type="email" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          )}
        </Field>
        <Field label="Rol">
          {(id) => (
            <select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy}>
          Crear usuario
        </Button>
      </form>
    </>
  );
}
