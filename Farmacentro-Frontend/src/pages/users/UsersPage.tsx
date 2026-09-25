import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { http, query } from '../../api/http';
import { ROLE_LABELS, type Paged, type Role, type UserSummary } from '../../api/types';
import { Badge, DateTime, Empty, ErrorAlert, Loading, PageHeader, Pagination } from '../../components/ui';

/** A1 — Users (Administrator home). */
export function UsersPage() {
  const [data, setData] = useState<Paged<UserSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'' | 'active' | 'disabled'>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => {
      http
        .get<Paged<UserSummary>>(`/users${query({ page, role, status, q: q.trim() })}`)
        .then(setData)
        .catch(setError);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [page, role, status, q]);

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Cuentas del personal y sus roles"
        actions={
          <Link to="/usuarios/nuevo" className="btn btn-primary">
            Nuevo usuario
          </Link>
        }
      />
      <div className="filters">
        <input placeholder="Buscar por usuario o nombre" value={q} maxLength={50} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={role} onChange={(e) => { setRole(e.target.value as Role | ''); setPage(1); }} aria-label="Rol">
          <option value="">Todos los roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value as '' | 'active' | 'disabled'); setPage(1); }} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="disabled">Deshabilitados</option>
        </select>
      </div>
      <ErrorAlert error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>No hay usuarios con esos filtros.</Empty>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Huella</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/usuarios/${u.id}`}>{u.username}</Link>
                  </td>
                  <td>{u.fullName}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>
                    {u.status === 'active' ? <Badge tone="success">Activo</Badge> : <Badge tone="danger">Deshabilitado</Badge>}{' '}
                    {u.locked && <Badge tone="warning">Bloqueado</Badge>}
                  </td>
                  <td>{u.hasWebAuthn ? <Badge tone="info">Registrada</Badge> : <span className="muted">No</span>}</td>
                  <td>
                    <DateTime value={u.lastLoginAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
