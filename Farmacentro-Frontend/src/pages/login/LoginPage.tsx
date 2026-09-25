import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Button, ErrorAlert, Field } from '../../components/ui';

/** C1 — Username and password (first factor). */
export function LoginPage() {
  const { status, login, endedReason } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim().toLowerCase(), password);
      setPassword('');
      navigate('/login/segundo-factor');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          FarmaCentro
        </div>
        <h1>Iniciar sesión</h1>
        {endedReason === 'expired' && (
          <Alert kind="warning">Tu sesión se cerró por inactividad. Vuelve a iniciar sesión.</Alert>
        )}
        {endedReason === 'logout' && <Alert kind="info">Cerraste sesión correctamente.</Alert>}
        <Field label="Usuario">
          {(id) => (
            <input id={id} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          )}
        </Field>
        <Field label="Contraseña">
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={!username || !password}>
          Continuar
        </Button>
        <p className="muted small">
          Después se te pedirá tu huella o un código enviado a tu correo. Tras 5 intentos fallidos la cuenta se bloquea 15
          minutos.
        </p>
      </form>
    </div>
  );
}
