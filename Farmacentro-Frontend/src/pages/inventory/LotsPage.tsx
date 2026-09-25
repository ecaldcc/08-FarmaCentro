import { useEffect, useState } from 'react';
import { http, query } from '../../api/http';
import type { Lot, Paged } from '../../api/types';
import { Badge, DateTime, Empty, ErrorAlert, Loading, PageHeader, Pagination } from '../../components/ui';

/** B3 — Lots with expiry and quantity. */
export function LotsPage() {
  const [data, setData] = useState<Paged<Lot> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [includeExpired, setIncludeExpired] = useState(false);

  useEffect(() => {
    http
      .get<Paged<Lot>>(`/inventory/lots${query({ page, includeExpired: includeExpired ? 'true' : 'false' })}`)
      .then(setData)
      .catch(setError);
  }, [page, includeExpired]);

  return (
    <>
      <PageHeader title="Lotes" subtitle="Ordenados por fecha de vencimiento (se vende primero el que vence antes)." />
      <div className="filters">
        <label className="checkbox">
          <input type="checkbox" checked={includeExpired} onChange={(e) => { setIncludeExpired(e.target.checked); setPage(1); }} /> Incluir vencidos
        </label>
      </div>
      <ErrorAlert error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>No hay lotes.</Empty>
      ) : (
        <>
          <LotsTable lots={data.items} />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

export function LotsTable({ lots }: { lots: Lot[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Lote</th>
          <th>Vence</th>
          <th>Cantidad</th>
          <th>Droguería</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((l) => (
          <tr key={l.id}>
            <td>
              {l.productName} <span className="muted">{l.sku}</span> {l.isControlled && <Badge tone="danger">Controlado</Badge>}
            </td>
            <td>{l.lotNumber}</td>
            <td>
              <DateTime value={l.expiresAt} /> {l.expired && <Badge tone="danger">Vencido</Badge>}
            </td>
            <td>{l.quantity}</td>
            <td>{l.supplier ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
