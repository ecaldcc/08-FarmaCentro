import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { http } from '../../api/http';
import type { Sale } from '../../api/types';
import { Button, ErrorAlert, Loading, Money } from '../../components/ui';
import { formatDateTime } from '../../utils/format';
import { SaleItemsTable } from './SaleItemsTable';

/** K3 — Printable receipt (not a tax invoice: FEL is out of scope). */
export function ReceiptPage() {
  const { id = '' } = useParams();
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    http.get<Sale>(`/sales/${id}`).then(setSale).catch(setError);
  }, [id]);

  if (error) return <ErrorAlert error={error} />;
  if (!sale) return <Loading />;

  return (
    <section className="card receipt">
      <header>
        <h1>FarmaCentro</h1>
        <p className="muted">Comprobante de venta · sin validez fiscal (prototipo)</p>
      </header>
      <dl className="details inline">
        <dt>Venta</dt>
        <dd>{sale.saleNumber}</dd>
        <dt>Fecha</dt>
        <dd>{formatDateTime(sale.createdAt)}</dd>
        <dt>Facturado a</dt>
        <dd>{sale.billing.name}</dd>
        <dt>{sale.billing.type === 'CUI' ? 'DPI' : 'NIT'}</dt>
        <dd>{sale.billing.type === 'CF' ? 'CF' : sale.billing.taxIdDisplay}</dd>
        <dt>Cliente de fidelización</dt>
        <dd>{sale.customerName ?? '—'}</dd>
        <dt>Atendió</dt>
        <dd>{sale.cashierUsername ?? '—'}</dd>
      </dl>
      <SaleItemsTable sale={sale} />
      <dl className="details inline">
        <dt>Forma de pago</dt>
        <dd>{sale.payment.method === 'cash' ? 'Efectivo' : 'Tarjeta (simulada)'}</dd>
        {sale.payment.method === 'cash' ? (
          <>
            <dt>Recibido</dt>
            <dd>
              <Money cents={sale.payment.amountReceivedCents ?? 0} />
            </dd>
            <dt>Cambio</dt>
            <dd>
              <Money cents={sale.payment.changeCents ?? 0} />
            </dd>
          </>
        ) : (
          <>
            <dt>Autorización</dt>
            <dd>{sale.payment.authorizationRef}</dd>
          </>
        )}
        {sale.pointsEarned > 0 && (
          <>
            <dt>Puntos ganados</dt>
            <dd>{sale.pointsEarned}</dd>
          </>
        )}
      </dl>
      <div className="button-row no-print">
        <Button onClick={() => window.print()}>Imprimir</Button>
        <Link to="/pos" className="btn btn-secondary">
          Nueva venta
        </Link>
      </div>
    </section>
  );
}
