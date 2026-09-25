import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { http } from '../../api/http';
import type { PrescriptionDetail, Product, Sale } from '../../api/types';
import { useStepUp } from '../../auth/StepUp';
import { QuantityInput } from '../../components/QuantityInput';
import { Alert, Badge, Button, ErrorAlert, Loading, PageHeader, ReasonDialog } from '../../components/ui';
import { formatDate, PRESCRIPTION_STATUS_LABELS } from '../../utils/format';
import { PaymentModal } from '../pos/PosPage';

/** R6 — Decrypted prescription (access is audited) and dispensation (step-up for controlled). */
export function PrescriptionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { withStepUp } = useStepUp();
  const [prescription, setPrescription] = useState<PrescriptionDetail | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<unknown>(null);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    const data = await http.get<PrescriptionDetail>(`/prescriptions/${id}`);
    setPrescription(data);
    setQuantities(Object.fromEntries(data.items.map((i) => [i.productId, i.quantityRemaining])));
    const products = await Promise.all(data.items.map((i) => http.get<Product>(`/products/${i.productId}`)));
    setPrices(Object.fromEntries(products.map((p) => [p.id, p.unitPriceCents])));
  }, [id]);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  if (error && !prescription) return <ErrorAlert error={error} />;
  if (!prescription) return <Loading />;

  const selected = prescription.items.filter((i) => (quantities[i.productId] ?? 0) > 0);
  const total = selected.reduce((sum, i) => sum + (quantities[i.productId] ?? 0) * (prices[i.productId] ?? 0), 0);
  const hasControlled = selected.some((i) => i.isControlled);
  const canDispense =
    !prescription.expired && (prescription.status === 'registered' || prescription.status === 'partially_dispensed');

  return (
    <>
      <PageHeader
        title={`Receta ${prescription.folio}`}
        subtitle="Consulta registrada en la bitácora"
        actions={
          prescription.status === 'registered' && (
            <Button variant="danger" onClick={() => setCancelling(true)}>
              Anular receta
            </Button>
          )
        }
      />
      {prescription.expired && <Alert kind="warning">La receta venció el {formatDate(prescription.validUntil)}.</Alert>}
      {prescription.cancel && <Alert kind="warning">Anulada. Motivo: {prescription.cancel.reason}</Alert>}
      <div className="grid-2">
        <section className="card">
          <dl className="details">
            <dt>Paciente</dt>
            <dd>{prescription.patientName}</dd>
            <dt>Médico</dt>
            <dd>
              {prescription.doctorName} · colegiado {prescription.doctorLicense}
            </dd>
            <dt>Emitida</dt>
            <dd>{formatDate(prescription.issuedAt)} (vigente hasta {formatDate(prescription.validUntil)})</dd>
            <dt>Estado</dt>
            <dd>{PRESCRIPTION_STATUS_LABELS[prescription.status]}</dd>
            {prescription.notes && (
              <>
                <dt>Notas</dt>
                <dd>{prescription.notes}</dd>
              </>
            )}
          </dl>
        </section>
        <section className="card">
          <h2>Medicamentos</h2>
          <table className="table compact">
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Dosis</th>
                <th>Prescrito</th>
                <th>Despachado</th>
                {canDispense && <th>Despachar</th>}
              </tr>
            </thead>
            <tbody>
              {prescription.items.map((item) => (
                <tr key={item.productId}>
                  <td>
                    {item.productName} {item.isControlled && <Badge tone="danger">Controlado</Badge>}
                  </td>
                  <td>{item.dosage}</td>
                  <td>{item.quantityPrescribed}</td>
                  <td>{item.quantityDispensed}</td>
                  {canDispense && (
                    <td>
                      <QuantityInput
                        value={quantities[item.productId] ?? 0}
                        min={0}
                        max={item.quantityRemaining}
                        label={`cantidad a despachar de ${item.productName}`}
                        onChange={(quantity) => setQuantities({ ...quantities, [item.productId]: quantity })}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {canDispense && (
            <>
              {hasControlled && <Alert kind="info">Incluye medicamentos controlados: se pedirá confirmar tu identidad.</Alert>}
              <Button onClick={() => setPaying(true)} disabled={selected.length === 0}>
                Despachar y cobrar
              </Button>
            </>
          )}
        </section>
      </div>
      <ErrorAlert error={error} />

      {paying && (
        <PaymentModal
          total={total}
          onClose={() => setPaying(false)}
          onPay={async (payment) => {
            const result = await withStepUp(
              { action: 'prescription.dispense', targetId: prescription.id, label: `Despachar controlados de la receta ${prescription.folio}` },
              () =>
                http.post<{ dispensationId: string; sale: Sale }>(`/prescriptions/${prescription.id}/dispense`, {
                  items: selected.map((i) => ({ productId: i.productId, quantity: quantities[i.productId] })),
                  payment,
                }),
            );
            navigate(`/ventas/${result.sale.id}/comprobante`);
          }}
        />
      )}
      {cancelling && (
        <ReasonDialog
          title={`Anular receta ${prescription.folio}`}
          confirmLabel="Anular receta"
          danger
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            await http.post(`/prescriptions/${prescription.id}/cancel`, { reason });
            await load();
          }}
        />
      )}
    </>
  );
}
