import { useCallback, useEffect, useState } from 'react';
import { http } from '../../api/http';
import { ROLE_LABELS, type CredentialInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useStepUp } from '../../auth/StepUp';
import { createCredential, describeWebAuthnError, webauthnSupported } from '../../auth/webauthn';
import { Alert, Button, DateTime, Empty, ErrorAlert, Field, PageHeader } from '../../components/ui';
import { ChangePasswordForm } from './ChangePasswordForm';

/** C5 — My account (with C4: register a fingerprint). */
export function AccountPage() {
  const { session, refresh } = useAuth();
  const { withStepUp } = useStepUp();
  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [nickname, setNickname] = useState('Lector de huella');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCredentials(await http.get<CredentialInfo[]>('/me/webauthn/credentials'));
  }, []);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  if (!session) return null;

  const register = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await withStepUp(
        { action: 'webauthn.register', targetId: null, label: 'Registrar una huella' },
        () => createCredential(nickname.trim() || 'Lector de huella'),
      );
      await http.post('/me/webauthn/register/verify', { response });
      setNotice('Huella registrada. La próxima vez podrás iniciar sesión con ella.');
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.name !== 'ApiError' ? new Error(describeWebAuthnError(e)) : e);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (credential: CredentialInfo) => {
    setError(null);
    setNotice(null);
    try {
      await withStepUp({ action: 'webauthn.revoke', targetId: credential.id, label: `Revocar la huella "${credential.nickname}"` }, () =>
        http.delete(`/me/webauthn/credentials/${credential.id}`),
      );
      setNotice('Huella revocada.');
      await load();
      await refresh();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <>
      <PageHeader title="Mi cuenta" subtitle={`${session.user.fullName} · ${ROLE_LABELS[session.user.role]}`} />
      {notice && <Alert kind="success">{notice}</Alert>}
      <ErrorAlert error={error} />
      <div className="grid-2">
        <section className="card">
          <h2>Huellas registradas</h2>
          <p className="muted">
            La huella se verifica en tu dispositivo (Windows Hello); el sistema solo guarda una clave pública, nunca tu huella.
          </p>
          {credentials.length === 0 ? (
            <Empty>Aún no tienes huellas registradas.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Registrada</th>
                  <th>Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nickname}</td>
                    <td>
                      <DateTime value={c.createdAt} />
                    </td>
                    <td>
                      <DateTime value={c.lastUsedAt} />
                    </td>
                    <td>
                      <Button variant="danger" small onClick={() => void revoke(c)}>
                        Revocar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {webauthnSupported() ? (
            <div className="stack">
              <Field label="Nombre para identificar este lector">
                {(id) => <input id={id} maxLength={50} value={nickname} onChange={(e) => setNickname(e.target.value)} />}
              </Field>
              <Button onClick={() => void register()} busy={busy}>
                Registrar mi huella
              </Button>
            </div>
          ) : (
            <Alert kind="warning">Este navegador no soporta WebAuthn. Usa Chrome o Edge con Windows Hello.</Alert>
          )}
        </section>
        <section className="card">
          <h2>Cambiar contraseña</h2>
          <ChangePasswordForm onDone={() => setNotice('Contraseña actualizada.')} />
        </section>
      </div>
    </>
  );
}
