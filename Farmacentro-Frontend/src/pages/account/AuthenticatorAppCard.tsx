import { useCallback, useEffect, useState } from 'react';
import { http } from '../../api/http';
import { useAuth } from '../../auth/AuthContext';
import { useStepUp } from '../../auth/StepUp';
import { QrCode } from '../../components/QrCode';
import { Alert, Button, DateTime, ErrorAlert, Field } from '../../components/ui';

interface TotpStatus {
  enabled: boolean;
  enabledAt: string | null;
}

interface TotpSetup {
  otpauthUri: string;
  secret: string;
  issuer: string;
  account: string;
  expiresAt: string;
}

/** Authenticator app (D-32): confirms critical operations without sending e-mails. */
export function AuthenticatorAppCard({ onNotice }: { onNotice: (message: string) => void }) {
  const { refresh } = useAuth();
  const { withStepUp } = useStepUp();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setStatus(await http.get<TotpStatus>('/me/totp'));
  }, []);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const result = await withStepUp({ action: 'totp.enroll', targetId: null, label: 'Configurar la app autenticadora' }, () =>
        http.post<TotpSetup>('/me/totp/setup'),
      );
      setCode('');
      setSetup(result);
    });

  const confirm = () =>
    run(async () => {
      setStatus(await http.post<TotpStatus>('/me/totp/confirm', { code }));
      setSetup(null);
      setCode('');
      onNotice('App autenticadora configurada. Úsala para confirmar las operaciones críticas.');
      await refresh();
    });

  const remove = () =>
    run(async () => {
      await withStepUp({ action: 'totp.revoke', targetId: null, label: 'Quitar la app autenticadora' }, () => http.delete('/me/totp'));
      onNotice('App autenticadora eliminada.');
      await load();
      await refresh();
    });

  return (
    <section className="card">
      <h2>App autenticadora</h2>
      <p className="muted">
        Las operaciones críticas (anular ventas, ajustar inventario, despachar controlados, administrar usuarios) se confirman con
        un código de 6 dígitos de Google Authenticator o Microsoft Authenticator. El inicio de sesión sigue siendo con el código
        por correo.
      </p>
      <ErrorAlert error={error} />
      {status?.enabled && !setup && (
        <>
          <Alert kind="success">
            Configurada desde <DateTime value={status.enabledAt} />.
          </Alert>
          <div className="button-row">
            <Button variant="secondary" onClick={() => void start()} busy={busy}>
              Cambiar de celular
            </Button>
            <Button variant="danger" onClick={() => void remove()} busy={busy}>
              Quitar
            </Button>
          </div>
        </>
      )}
      {status && !status.enabled && !setup && (
        <Button onClick={() => void start()} busy={busy}>
          Configurar app autenticadora
        </Button>
      )}
      {setup && (
        <div className="stack">
          <ol className="steps">
            <li>Instala Google Authenticator o Microsoft Authenticator en tu celular.</li>
            <li>En la app, elige "Agregar cuenta" y escanea este código:</li>
          </ol>
          <QrCode value={setup.otpauthUri} label={`Código QR para ${setup.issuer} (${setup.account})`} />
          <p className="small">
            ¿No puedes escanear? Escribe esta clave en la app: <code className="secret">{setup.secret}</code>
          </p>
          <Field label="Código de 6 dígitos que muestra la app" hint="Confírmalo antes de 10 minutos.">
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <div className="button-row">
            <Button onClick={() => void confirm()} disabled={code.length !== 6} busy={busy}>
              Confirmar
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
