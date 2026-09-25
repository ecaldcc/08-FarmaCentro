import { useEffect, useState } from 'react';
import { http } from '../api/http';
import { Button, Modal } from '../components/ui';
import { useAuth } from './AuthContext';

const WARNING_MS = 2 * 60 * 1000;

/**
 * C7 — Inactivity warning. The server expires the session after 15 minutes without requests;
 * this component only warns 2 minutes before, using the expiry the API reports. It never polls.
 */
export function SessionTimer() {
  const { status, sessionExpiresAt, refresh } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const remaining = sessionExpiresAt ? Date.parse(sessionExpiresAt) - now : Number.POSITIVE_INFINITY;
  const expired = status === 'authenticated' && remaining <= 0;

  useEffect(() => {
    // The server already expired the session: re-checking it shows the login screen.
    if (expired) void refresh();
  }, [expired, refresh]);

  if (status !== 'authenticated' || !sessionExpiresAt || remaining <= 0 || remaining > WARNING_MS) return null;

  const seconds = Math.ceil(remaining / 1000);
  return (
    <Modal title="Tu sesión está por cerrarse">
      <p>
        Por seguridad, la sesión se cierra tras 15 minutos sin actividad. Se cerrará en{' '}
        <strong>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </strong>
        .
      </p>
      <Button onClick={() => void http.get('/auth/me')}>Seguir trabajando</Button>
    </Modal>
  );
}
