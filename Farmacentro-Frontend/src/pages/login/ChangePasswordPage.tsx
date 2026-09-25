import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/ui';
import { ChangePasswordForm } from '../account/ChangePasswordForm';

/** C3 — Mandatory password change (first login or after an administrator reset). */
export function ChangePasswordPage() {
  const { status, session, refresh, logout } = useAuth();
  const navigate = useNavigate();
  if (status === 'loading') return null;
  if (status !== 'authenticated' || !session) return <Navigate to="/login" replace />;
  if (!session.user.mustChangePassword) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Cambia tu contraseña</h1>
        <Alert kind="warning">Debes elegir una contraseña propia antes de continuar.</Alert>
        <ChangePasswordForm
          onDone={async () => {
            await refresh();
            navigate('/', { replace: true });
          }}
        />
        <button type="button" className="link-button" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
