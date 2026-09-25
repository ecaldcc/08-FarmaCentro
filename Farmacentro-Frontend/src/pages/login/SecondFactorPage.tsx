import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ApiError, http } from '../../api/http';
import type { SessionInfo } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { describeWebAuthnError, signChallenge, webauthnSupported } from '../../auth/webauthn';
import { Alert, Button, ErrorAlert, Field } from '../../components/ui';

/** C2 — Second factor: fingerprint (WebAuthn) or 6-digit code by e-mail. */
export function SecondFactorPage() {
  const { status, mfaMethods, completeLogin, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState<{ sentTo: string; expiresAt: string } | null>(null);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (status === 'authenticated') return <Navigate to="/" replace />;
  if (status !== 'mfa') return <Navigate to="/login" replace />;

  const canUseFingerprint = mfaMethods.includes('webauthn') && webauthnSupported();

  const finish = (session: SessionInfo) => {
    completeLogin(session);
    navigate(session.user.mustChangePassword ? '/cambiar-contrasena' : '/', { replace: true });
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        // Too many failures locked the account or the 5-minute window expired.
        await refresh();
        navigate('/login', { replace: true });
        return;
      }
      setError(e instanceof ApiError ? e : new Error(describeWebAuthnError(e)));
    } finally {
      setBusy(false);
    }
  };

  const fingerprint = () =>
    run(async () => {
      const response = await signChallenge('/auth/webauthn/login/options');
      finish(await http.post<SessionInfo>('/auth/webauthn/login/verify', { response }));
    });

  const sendCode = () =>
    run(async () => {
      setSent(await http.post<{ sentTo: string; expiresAt: string }>('/auth/email-otp/send'));
      setCode('');
    });

  const verifyCode = () =>
    run(async () => {
      finish(await http.post<SessionInfo>('/auth/email-otp/verify', { code }));
    });

  const secondsLeft = sent ? Math.max(0, Math.floor((Date.parse(sent.expiresAt) - now) / 1000)) : 0;

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Verificación en dos pasos</h1>
        {canUseFingerprint && (
          <>
            <p>Coloca tu dedo en el lector cuando Windows Hello lo pida.</p>
            <Button onClick={fingerprint} busy={busy}>
              Usar mi huella
            </Button>
            <div className="divider">o</div>
          </>
        )}
        {!sent ? (
          <Button variant={canUseFingerprint ? 'secondary' : 'primary'} onClick={sendCode} busy={busy}>
            Enviarme un código por correo
          </Button>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode();
            }}
          >
            <Alert kind="info">
              Enviamos un código a {sent.sentTo}. Vence en {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, '0')}.
            </Alert>
            <Field label="Código de 6 dígitos">
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              )}
            </Field>
            <Button type="submit" disabled={code.length !== 6} busy={busy}>
              Verificar
            </Button>
            <Button variant="ghost" onClick={sendCode} disabled={busy}>
              Enviar un código nuevo
            </Button>
          </form>
        )}
        <ErrorAlert error={error} />
        <p className="muted small">Tienes 5 minutos para completar este paso.</p>
      </div>
    </div>
  );
}
