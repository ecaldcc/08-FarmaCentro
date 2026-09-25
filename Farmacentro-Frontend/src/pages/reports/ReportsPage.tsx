import { useEffect, useState } from 'react';
import { downloadFile, http, query } from '../../api/http';
import type { ReportData } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, Empty, ErrorAlert, Loading, PageHeader } from '../../components/ui';
import { formatDateTime, todayGt } from '../../utils/format';

interface ReportDef {
  key: string;
  label: string;
  path: string;
  permission: string;
  ranged: boolean;
}

const REPORTS: ReportDef[] = [
  { key: 'failed', label: 'Intentos fallidos', path: '/reports/failed-logins', permission: 'reports.failedLogins', ranged: true },
  { key: 'users', label: 'Usuarios y roles', path: '/reports/users-roles', permission: 'reports.usersRoles', ranged: false },
  { key: 'voids', label: 'Anulaciones', path: '/reports/voids', permission: 'reports.voids', ranged: true },
  { key: 'adjustments', label: 'Ajustes de inventario', path: '/reports/adjustments', permission: 'reports.adjustments', ranged: true },
  { key: 'controlled', label: 'Despachos de controlados', path: '/reports/controlled-dispensations', permission: 'reports.controlled', ranged: true },
];

function renderCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  return String(value);
}

/** U3 (and A4, B8, R13) — Audit reports; only the Auditor exports them to CSV. */
export function ReportsPage() {
  const { can } = useAuth();
  const available = REPORTS.filter((r) => can(r.permission));
  const [active, setActive] = useState(available[0]?.key ?? '');
  const [from, setFrom] = useState(todayGt(-30));
  const [to, setTo] = useState(todayGt());
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const report = available.find((r) => r.key === active);

  useEffect(() => {
    if (!report) return;
    setData(null);
    setError(null);
    http
      .get<ReportData>(`${report.path}${query(report.ranged ? { from, to } : {})}`)
      .then(setData)
      .catch(setError);
  }, [report, from, to]);

  if (!report) return <Empty>No tienes reportes disponibles.</Empty>;

  const exportCsv = async () => {
    try {
      await downloadFile(`${report.path}${query({ ...(report.ranged ? { from, to } : {}), format: 'csv' })}`, `${report.key}.csv`);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <>
      <PageHeader
        title="Reportes de auditoría"
        actions={
          can('reports.export') && (
            <Button variant="secondary" onClick={() => void exportCsv()}>
              Exportar CSV
            </Button>
          )
        }
      />
      <div className="tabs" role="tablist">
        {available.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={r.key === active} className={r.key === active ? 'active' : ''} onClick={() => setActive(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      {report.ranged && (
        <div className="filters">
          <label>
            Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}
      <ErrorAlert error={error} />
      {!data ? (
        !error && <Loading />
      ) : data.rows.length === 0 ? (
        <Empty>Sin datos en este periodo.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {data.columns.map((c) => (
                  <th key={c.key}>{c.header.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={index}>
                  {data.columns.map((c) => (
                    <td key={c.key}>{renderCell(row[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
