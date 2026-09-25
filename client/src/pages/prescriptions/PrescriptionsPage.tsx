import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { http, query } from '../../api/http';
import type { Paged, PrescriptionStatus, PrescriptionSummary } from '../../api/types';
import { Badge, DateTime, Empty, ErrorAlert, Loading, PageHeader, Pagination } from '../../components/ui';
import { formatDate, PRESCRIPTION_STATUS_LABELS } from '../../utils/format';

/** R4 — Prescriptions list (no clinical data is decrypted here). */
export function PrescriptionsPage() {
  const [data, setData] = useState<Paged<PrescriptionSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [folio, setFolio] = useState('');
  const [status, setStatus] = useState<PrescriptionStatus | ''>('');

  useEffect(() => {
    const validFolio = /^R-\d{6}$/.test(folio.trim().toUpperCase()) ? folio.trim().toUpperCase() : undefined;
    http
      .get<Paged<PrescriptionSummary>>(`/prescriptions${query({ page, status, folio: validFolio })}`)
      .then(setData)
      .catch(setError);
  }, [page, status, folio]);

  return (
    <>
      <PageHeader
        title="Recetas"
        subtitle="Información de salud: solo visible para el Regente y cada consulta queda en la bitácora."
        actions={
          <Link to="/recetas/nueva" className="btn btn-primary">
            Registrar receta
          </Link>
        }
      />
      <div className="filters">
        <input placeholder="Folio (R-000001)" value={folio} maxLength={8} onChange={(e) => { setFolio(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value as PrescriptionStatus | ''); setPage(1); }} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(PRESCRIPTION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ErrorAlert error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>No hay recetas.</Empty>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Emitida</th>
                <th>Estado</th>
                <th>Controlados</th>
                <th>Registrada</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/recetas/${p.id}`}>{p.folio}</Link>
                  </td>
                  <td>
                    {formatDate(p.issuedAt)} {p.expired && <Badge tone="warning">Vencida</Badge>}
                  </td>
                  <td>{PRESCRIPTION_STATUS_LABELS[p.status]}</td>
                  <td>{p.hasControlled ? <Badge tone="danger">Sí</Badge> : 'No'}</td>
                  <td>
                    <DateTime value={p.createdAt} />
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
