import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { http } from '../../api/http';
import type { Sale } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useStepUp } from '../../auth/StepUp';
import { Alert, Badge, Button, DateTime, ErrorAlert, Loading, PageHeader, ReasonDialog } from '../../components/ui';
import { METHOD_LABELS, todayGt } from '../../utils/format';
import { SaleItemsTable } from './SaleItemsTable';

/** R3 — Sale detail; the Regente can void it (reason + step-up). */
export function SaleDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const { withStepUp } = useStepUp();
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => setSale(await http.get<Sale>(`/sales/${id}`)), [id]);
  useEffect(() => {
    load().catch(setError);
  }, [load]);

  if (error && !sale) return <ErrorAlert error={error} />;
  if (!sale) return <Loading />;

  const sameDay = new Date(Date.parse(sale.createdAt) - 6 * 3_600_000).toISOString().slice(0, 10) === todayGt();
  const canVoid = can('sales.void') && sale.status === 'completed' && !sale.fromPrescription && sameDay;

  return (
    <>
      <PageHeader
        title={`Venta ${sale.saleNumber}`}
        subtitle={new Date(sale.createdAt).toLocaleString('es-GT')}
        actions={
          <>
            <Link to={`/ventas/${sale.id}/comprobante`} className="btn btn-secondary">
              Comprobante
            </Link>
            {canVoid && (
              <Button variant="danger" onClick={() => setVoiding(true)}>
                Anular venta
              </Button>
            )}
          </>
        }
      />
      {sale.status === 'voided' && sale.void && (
        <Alert kind="warning">
          Anulada el <DateTime value={sale.void.voidedAt} /> por {sale.void.voidedByUsername ?? 'usuario'} (
          {METHOD_LABELS[sale.void.stepUpMethod] ?? sale.void.stepUpMethod}). Motivo: {sale.void.reason}
        </Alert>
      )}
      <section className="card">
        <dl className="details inline">
          <dt>Facturado a</dt>
          <dd>{sale.billing.name}</dd>
          <dt>{sale.billing.type === 'CUI' ? 'DPI' : 'NIT'}</dt>
          <dd>{sale.billing.type === 'CF' ? 'CF' : sale.billing.taxIdDisplay}</dd>
          <dt>Cliente de fidelización</dt>
          <dd>{sale.customerName ?? '—'}</dd>
          <dt>Cajero</dt>
          <dd>{sale.cashierUsername ?? '—'}</dd>
          <dt>Estado</dt>
          <dd>{sale.status === 'completed' ? <Badge tone="success">Completada</Badge> : <Badge tone="danger">Anulada</Badge>}</dd>
          <dt>Pago</dt>
          <dd>
            {sale.payment.method === 'cash' ? 'Efectivo' : `Tarjeta simulada · ref. ${sale.payment.authorizationRef ?? ''}`}
          </dd>
          <dt>Puntos</dt>
          <dd>{sale.pointsEarned}</dd>
        </dl>
        <SaleItemsTable sale={sale} />
      </section>
      <ErrorAlert error={error} />
      {voiding && (
        <ReasonDialog
          title={`Anular venta ${sale.saleNumber}`}
          description={<p>Se devolverán las existencias a sus lotes y se revertirán los puntos del cliente.</p>}
          confirmLabel="Anular venta"
          danger
          onClose={() => setVoiding(false)}
          onConfirm={async (reason) => {
            const updated = await withStepUp({ action: 'sale.void', targetId: sale.id, label: `Anular venta ${sale.saleNumber}` }, () =>
              http.post<Sale>(`/sales/${sale.id}/void`, { reason }),
            );
            setSale(updated);
          }}
        />
      )}
    </>
  );
}
