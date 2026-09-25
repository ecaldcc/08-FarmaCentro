import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { http, query } from '../../api/http';
import type { Paged, Sale } from '../../api/types';
import { Badge, DateTime, Empty, ErrorAlert, Loading, Money, PageHeader, Pagination } from '../../components/ui';
import { todayGt } from '../../utils/format';

/** R2 (all sales, Regente) and K7 (own sales of the day, Cajero). */
export function SalesPage({ mode }: { mode: 'all' | 'own' }) {
  const [data, setData] = useState<Paged<Sale> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(todayGt(-7));
  const [to, setTo] = useState(todayGt());
  const [status, setStatus] = useState<'' | 'completed' | 'voided'>('');

  useEffect(() => {
    const params = mode === 'all' ? { page, from, to, status } : { page, status };
    http.get<Paged<Sale>>(`/sales${query(params)}`).then(setData).catch(setError);
  }, [mode, page, from, to, status]);

  return (
    <>
      <PageHeader
        title={mode === 'all' ? 'Ventas' : 'Mis ventas del día'}
        subtitle={mode === 'own' ? 'Para anular una venta, solicítalo al Regente.' : undefined}
      />
      <div className="filters">
        {mode === 'all' && (
          <>
            <label>
              Desde <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </label>
            <label>
              Hasta <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </label>
          </>
        )}
        <select value={status} onChange={(e) => { setStatus(e.target.value as '' | 'completed' | 'voided'); setPage(1); }} aria-label="Estado">
          <option value="">Todas</option>
          <option value="completed">Completadas</option>
          <option value="voided">Anuladas</option>
        </select>
      </div>
      <ErrorAlert error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>No hay ventas en este periodo.</Empty>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Venta</th>
                <th>Fecha</th>
                <th>Facturado a</th>
                <th>Cajero</th>
                <th>Pago</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/ventas/${s.id}`}>{s.saleNumber}</Link> {s.fromPrescription && <Badge tone="info">Receta</Badge>}
                  </td>
                  <td>
                    <DateTime value={s.createdAt} />
                  </td>
                  <td>{s.billing.name}</td>
                  <td>{s.cashierUsername ?? '—'}</td>
                  <td>{s.payment.method === 'cash' ? 'Efectivo' : 'Tarjeta (simulada)'}</td>
                  <td>
                    <Money cents={s.totalCents} />
                  </td>
                  <td>{s.status === 'completed' ? <Badge tone="success">Completada</Badge> : <Badge tone="danger">Anulada</Badge>}</td>
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
