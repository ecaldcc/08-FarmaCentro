import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { Role } from './api/types';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SessionTimer } from './auth/SessionTimer';
import { StepUpProvider } from './auth/StepUp';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { AccountPage } from './pages/account/AccountPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { VerifyChainPage } from './pages/audit/VerifyChainPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { NewCustomerPage } from './pages/customers/NewCustomerPage';
import { ForbiddenPage, NotFoundPage } from './pages/errors/ErrorPages';
import { AdjustmentPage } from './pages/inventory/AdjustmentPage';
import { ExpiringPage } from './pages/inventory/ExpiringPage';
import { LotsPage } from './pages/inventory/LotsPage';
import { MovementsPage } from './pages/inventory/MovementsPage';
import { ProductFormPage } from './pages/inventory/ProductFormPage';
import { ProductsPage } from './pages/inventory/ProductsPage';
import { ReceiptFormPage } from './pages/inventory/ReceiptFormPage';
import { ChangePasswordPage } from './pages/login/ChangePasswordPage';
import { LoginPage } from './pages/login/LoginPage';
import { SecondFactorPage } from './pages/login/SecondFactorPage';
import { PosPage } from './pages/pos/PosPage';
import { NewPrescriptionPage } from './pages/prescriptions/NewPrescriptionPage';
import { PrescriptionDetailPage } from './pages/prescriptions/PrescriptionDetailPage';
import { PrescriptionsPage } from './pages/prescriptions/PrescriptionsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { ReceiptPage } from './pages/sales/ReceiptPage';
import { SaleDetailPage } from './pages/sales/SaleDetailPage';
import { SalesPage } from './pages/sales/SalesPage';
import { NewUserPage } from './pages/users/NewUserPage';
import { UserDetailPage } from './pages/users/UserDetailPage';
import { UsersPage } from './pages/users/UsersPage';

const HOME: Record<Role, string> = {
  admin: '/usuarios',
  regente: '/pos',
  cajero: '/pos',
  bodeguero: '/inventario',
  auditor: '/bitacora',
};

function RequireSession({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'mfa') return <Navigate to="/login/segundo-factor" replace />;
  if (status !== 'authenticated' || !session) return <Navigate to="/login" replace />;
  if (session.user.mustChangePassword) return <Navigate to="/cambiar-contrasena" replace />;
  return <>{children}</>;
}

/** Hides screens of other roles. The API answers 403 anyway (docs/pantallas.md §4). */
function RequirePermission({ permission, children }: { permission: string | string[]; children: ReactNode }) {
  const { can } = useAuth();
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some((p) => can(p)) ? <>{children}</> : <ForbiddenPage />;
}

function Home() {
  const { session } = useAuth();
  return <Navigate to={session ? HOME[session.user.role] : '/login'} replace />;
}

const guard = (permission: string | string[], element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

export function App() {
  return (
    <AuthProvider>
      <StepUpProvider>
        <BrowserRouter>
          <SessionTimer />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/segundo-factor" element={<SecondFactorPage />} />
            <Route path="/cambiar-contrasena" element={<ChangePasswordPage />} />
            <Route
              element={
                <RequireSession>
                  <Layout />
                </RequireSession>
              }
            >
              <Route index element={<Home />} />
              <Route path="/mi-cuenta" element={<AccountPage />} />

              <Route path="/usuarios" element={guard('users.manage', <UsersPage />)} />
              <Route path="/usuarios/nuevo" element={guard('users.manage', <NewUserPage />)} />
              <Route path="/usuarios/:id" element={guard('users.manage', <UserDetailPage />)} />

              <Route path="/pos" element={guard('pos.sell', <PosPage />)} />
              <Route path="/ventas" element={guard('sales.viewAll', <SalesPage mode="all" />)} />
              <Route path="/mis-ventas" element={guard('sales.viewOwn', <SalesPage mode="own" />)} />
              <Route path="/ventas/:id" element={guard(['sales.viewAll', 'sales.viewOwn'], <SaleDetailPage />)} />
              <Route path="/ventas/:id/comprobante" element={guard('pos.sell', <ReceiptPage />)} />

              <Route path="/clientes" element={guard('customers.manage', <CustomersPage />)} />
              <Route path="/clientes/nuevo" element={guard('customers.manage', <NewCustomerPage />)} />
              <Route path="/clientes/:id" element={guard('customers.manage', <CustomerDetailPage />)} />

              <Route path="/recetas" element={guard('prescriptions.manage', <PrescriptionsPage />)} />
              <Route path="/recetas/nueva" element={guard('prescriptions.manage', <NewPrescriptionPage />)} />
              <Route path="/recetas/:id" element={guard('prescriptions.manage', <PrescriptionDetailPage />)} />

              <Route path="/inventario" element={guard('inventory.view', <ProductsPage />)} />
              <Route path="/inventario/productos/nuevo" element={guard('products.manage', <ProductFormPage />)} />
              <Route path="/inventario/productos/:id" element={guard('inventory.view', <ProductFormPage />)} />
              <Route path="/inventario/lotes" element={guard('inventory.view', <LotsPage />)} />
              <Route path="/inventario/entradas/nueva" element={guard('inventory.receive', <ReceiptFormPage />)} />
              <Route path="/inventario/vencimientos" element={guard('inventory.view', <ExpiringPage />)} />
              <Route path="/inventario/ajustes/nuevo" element={guard('inventory.adjust', <AdjustmentPage />)} />
              <Route path="/inventario/movimientos" element={guard('inventory.view', <MovementsPage />)} />

              <Route path="/bitacora" element={guard('audit.view', <AuditLogPage />)} />
              <Route path="/bitacora/verificacion" element={guard('audit.view', <VerifyChainPage />)} />
              <Route
                path="/reportes"
                element={guard(
                  ['reports.failedLogins', 'reports.usersRoles', 'reports.voids', 'reports.adjustments', 'reports.controlled'],
                  <ReportsPage />,
                )}
              />
              <Route path="/acceso-denegado" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </StepUpProvider>
    </AuthProvider>
  );
}
