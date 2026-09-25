import { NavLink, Outlet } from 'react-router';
import { ROLE_LABELS } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  permission: string | null;
}

// Menu built from the permissions returned by /auth/me. Hiding is a convenience only:
// the API enforces every role check again.
const NAV: NavItem[] = [
  { to: '/usuarios', label: 'Usuarios', permission: 'users.manage' },
  { to: '/pos', label: 'Punto de venta', permission: 'pos.sell' },
  { to: '/ventas', label: 'Ventas', permission: 'sales.viewAll' },
  { to: '/mis-ventas', label: 'Mis ventas del día', permission: 'sales.viewOwn' },
  { to: '/clientes', label: 'Clientes', permission: 'customers.manage' },
  { to: '/recetas', label: 'Recetas', permission: 'prescriptions.manage' },
  { to: '/inventario', label: 'Inventario', permission: 'inventory.view' },
  { to: '/inventario/lotes', label: 'Lotes', permission: 'inventory.view' },
  { to: '/inventario/vencimientos', label: 'Vencimientos', permission: 'inventory.view' },
  { to: '/inventario/movimientos', label: 'Kardex', permission: 'inventory.view' },
  { to: '/bitacora', label: 'Bitácora', permission: 'audit.view' },
  { to: '/bitacora/verificacion', label: 'Verificar bitácora', permission: 'audit.view' },
  { to: '/reportes', label: 'Reportes', permission: null },
];

const REPORT_PERMISSIONS = ['reports.failedLogins', 'reports.usersRoles', 'reports.voids', 'reports.adjustments', 'reports.controlled'];

export function Layout() {
  const { session, logout, can } = useAuth();
  if (!session) return null;
  const items = NAV.filter((item) =>
    item.permission === null ? REPORT_PERMISSIONS.some((p) => can(p)) : can(item.permission),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          FarmaCentro
        </div>
        <nav aria-label="Menú principal">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">Prototipo académico · datos ficticios</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="user-chip">
            <strong>{session.user.fullName}</strong>
            <span>
              {session.user.username} · {ROLE_LABELS[session.user.role]}
            </span>
          </div>
          <NavLink to="/mi-cuenta" className="topbar-link">
            Mi cuenta
          </NavLink>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
