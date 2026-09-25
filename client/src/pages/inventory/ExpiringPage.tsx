import { useEffect, useState } from 'react';
import { http } from '../../api/http';
import type { Lot } from '../../api/types';
import { Empty, ErrorAlert, Loading, PageHeader } from '../../components/ui';
import { LotsTable } from './LotsPage';

/** B5 — Lots expiring within N days, and expired lots that still have stock. */
export function ExpiringPage() {
  const [days, setDays] = useState(60);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    http.get<Lot[]>(`/inventory/expiring?withinDays=${days}`).then(setLots).catch(setError);
  }, [days]);

  return (
    <>
      <PageHeader title="Vencimientos" subtitle="Los lotes vencidos no se venden; dales de baja con un ajuste." />
      <div className="filters">
        <label>
          Vencen en los próximos{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorAlert error={error} />
      {!lots ? <Loading /> : lots.length === 0 ? <Empty>No hay lotes por vencer en ese plazo.</Empty> : <LotsTable lots={lots} />}
    </>
  );
}
