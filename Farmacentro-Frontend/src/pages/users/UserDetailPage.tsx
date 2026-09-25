import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { http } from '../../api/http';
import { ROLE_LABELS, type Role, type UserDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useStepUp } from '../../auth/StepUp';
import { Alert, Badge, Button, DateTime, ErrorAlert, Field, Loading, Modal, PageHeader, ReasonDialog } from '../../components/ui';

type Dialog =
  | { kind: 'role' }
  | { kind: 'status' }
  | { kind: 'unlock' }
  | { kind: 'reset' }
  | { kind: 'revoke'; credentialId: string; nickname: string }
  | { kind: 'edit' }
  | null;

/** A3 — User detail with every administrative action (each one with reason + step-up). */
export function UserDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const { withStepUp } = useStepUp();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newRole, setNewRole] = useState<Role>('cajero');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await http.get<UserDetail>(`/users/${id}`);
    setUser(data);
    setNewRole(data.role);
  }, [id]);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  if (error && !user) return <ErrorAlert error={error} />;
  if (!user) return <Loading />;
  const isSelf = session?.user.id === user.id;

  const act = async (action: string, label: string, run: () => Promise<unknown>, message: string) => {
    await withStepUp({ action, targetId: user.id, label: `${label} (${user.username})` }, run);
    setNotice(message);
    await load();
  };

  return (
    <>
      <PageHeader
        title={user.fullName}
        subtitle={`${user.username} · ${ROLE_LABELS[user.role]}`}
        actions={
          <Button variant="secondary" onClick={() => setDialog({ kind: 'edit' })}>
            Editar datos
          </Button>
        }
      />
      {notice && <Alert kind="success">{notice}</Alert>}
      {temporaryPassword && (
        <Alert kind="warning">
          Contraseña temporal (se muestra una sola vez): <code className="secret">{temporaryPassword}</code>
        </Alert>
      )}
      <div className="grid-2">
        <section className="card">
          <h2>Datos</h2>
          <dl className="details">
            <dt>Correo</dt>
            <dd>{user.email}</dd>
            <dt>Estado</dt>
            <dd>
              {user.status === 'active' ? <Badge tone="success">Activo</Badge> : <Badge tone="danger">Deshabilitado</Badge>}{' '}
              {user.locked && <Badge tone="warning">Bloqueado hasta {new Date(user.lockedUntil ?? '').toLocaleTimeString('es-GT')}</Badge>}
            </dd>
            <dt>Último acceso</dt>
            <dd>
              <DateTime value={user.lastLoginAt} />
            </dd>
            <dt>Creado</dt>
            <dd>
              <DateTime value={user.createdAt} />
            </dd>
          </dl>
          {isSelf && <Alert kind="info">No puedes cambiar tu propio rol ni deshabilitar tu propia cuenta.</Alert>}
          <div className="button-row">
            <Button onClick={() => setDialog({ kind: 'role' })} disabled={isSelf}>
              Cambiar rol
            </Button>
            <Button variant={user.status === 'active' ? 'danger' : 'primary'} onClick={() => setDialog({ kind: 'status' })} disabled={isSelf}>
              {user.status === 'active' ? 'Deshabilitar' : 'Habilitar'}
            </Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: 'unlock' })} disabled={!user.locked}>
              Desbloquear
            </Button>
            <Button variant="secondary" onClick={() => setDialog({ kind: 'reset' })} disabled={isSelf}>
              Restablecer contraseña
            </Button>
          </div>
        </section>
        <section className="card">
          <h2>Huellas registradas</h2>
          {user.credentials.length === 0 ? (
            <p className="muted">Sin huellas registradas.</p>
          ) : (
            <ul className="list">
              {user.credentials.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.nickname} · último uso <DateTime value={c.lastUsedAt} />
                  </span>
                  <Button small variant="danger" onClick={() => setDialog({ kind: 'revoke', credentialId: c.id, nickname: c.nickname })}>
                    Revocar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Revoca una huella cuando el empleado pierde el dispositivo o deja de usar ese lector.</p>
        </section>
      </div>

      {dialog?.kind === 'role' && (
        <ReasonDialog
          title="Cambiar rol"
          description={
            <Field label="Nuevo rol">
              {(fid) => (
                <select id={fid} value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          }
          confirmLabel="Cambiar rol"
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            act('user.role.change', 'Cambiar rol', () => http.put(`/users/${user.id}/role`, { role: newRole, reason }), 'Rol actualizado.')
          }
        />
      )}
      {dialog?.kind === 'status' && (
        <ReasonDialog
          title={user.status === 'active' ? 'Deshabilitar usuario' : 'Habilitar usuario'}
          confirmLabel={user.status === 'active' ? 'Deshabilitar' : 'Habilitar'}
          danger={user.status === 'active'}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            act(
              'user.status.change',
              user.status === 'active' ? 'Deshabilitar usuario' : 'Habilitar usuario',
              () => http.put(`/users/${user.id}/status`, { status: user.status === 'active' ? 'disabled' : 'active', reason }),
              'Estado actualizado.',
            )
          }
        />
      )}
      {dialog?.kind === 'unlock' && (
        <ReasonDialog
          title="Desbloquear cuenta"
          confirmLabel="Desbloquear"
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            act('user.unlock', 'Desbloquear cuenta', () => http.post(`/users/${user.id}/unlock`, { reason }), 'Cuenta desbloqueada.')
          }
        />
      )}
      {dialog?.kind === 'reset' && (
        <ReasonDialog
          title="Restablecer contraseña"
          description={<p>Se generará una contraseña temporal que el usuario deberá cambiar al entrar.</p>}
          confirmLabel="Restablecer"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const result = await withStepUp(
              { action: 'user.password.reset', targetId: user.id, label: `Restablecer contraseña (${user.username})` },
              () => http.post<{ temporaryPassword: string }>(`/users/${user.id}/password-reset`, { reason }),
            );
            setTemporaryPassword(result.temporaryPassword);
            await load();
          }}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <ReasonDialog
          title={`Revocar huella "${dialog.nickname}"`}
          confirmLabel="Revocar"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            act(
              'user.webauthn.revoke',
              'Revocar huella',
              () => http.delete(`/users/${user.id}/webauthn/${dialog.credentialId}`, { reason }),
              'Huella revocada.',
            )
          }
        />
      )}
      {dialog?.kind === 'edit' && <EditUserDialog user={user} onClose={() => setDialog(null)} onSaved={async () => { setNotice('Datos actualizados.'); await load(); }} />}
    </>
  );
}

function EditUserDialog({ user, onClose, onSaved }: { user: UserDetail; onClose: () => void; onSaved: () => Promise<void> }) {
  const { withStepUp } = useStepUp();
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (fullName !== user.fullName) body.fullName = fullName;
      if (email !== user.email) body.email = email;
      await withStepUp({ action: 'user.update', targetId: user.id, label: `Editar usuario (${user.username})` }, () =>
        http.patch(`/users/${user.id}`, body),
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Editar datos"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} busy={busy} disabled={fullName === user.fullName && email === user.email}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre completo">{(id) => <input id={id} value={fullName} maxLength={100} onChange={(e) => setFullName(e.target.value)} />}</Field>
      <Field label="Correo" hint="Se avisará al correo anterior y al nuevo.">
        {(id) => <input id={id} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <ErrorAlert error={error} />
    </Modal>
  );
}
