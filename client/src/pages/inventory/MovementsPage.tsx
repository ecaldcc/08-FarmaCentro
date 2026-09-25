import { useEffect, useState } from 'react';
import { http, query } from '../../api/http';
import type { Movement, Paged } from '../../api/types';
import { Badge, DateTime, Empty, ErrorAlert, Loading, PageHeader, Pagination } from '../../components/ui';
import { ADJUSTMENT_LABELS, METHOD_LABELS, MOVEMENT_LABELS } from '../../utils/format';

/** B7 — Kardex (append-only inventory ledger). */
export function MovementsPage() {
  const [data, setData] = useState<Paged<Movement> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');

  useEffect(() => {
    http.get<Paged<Movement>>(`/inventory/movements${query({ page, type })}`).then(setData).catch(setError);
  }, [page, type]);

  return (
    <>
      <PageHeader title="Kardex" subtitle="Historial de movimientos. No se puede modificar ni borrar." />
      <div className="filters">
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Tipo de movimiento">
          <option value="">Todos los movimientos</option>
          {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
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
        <Empty>No hay movimientos.</Empty>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Saldo del lote</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td>
                    <DateTime value={m.createdAt} />
                  </td>
                  <td>
                    {m.productName} {m.isControlled && <Badge tone="danger">Controlado</Badge>}
                  </td>
                  <td>{MOVEMENT_LABELS[m.type]}</td>
                  <td className={m.quantityDelta < 0 ? 'negative' : 'positive'}>{m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}</td>
                  <td>{m.balanceAfter}</td>
                  <td>
                    {m.reasonCode ? `${ADJUSTMENT_LABELS[m.reasonCode] ?? m.reasonCode}: ` : ''}
                    {m.reason ?? ''}
                    {m.stepUpMethod && <span className="muted small"> · {METHOD_LABELS[m.stepUpMethod] ?? m.stepUpMethod}</span>}
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
