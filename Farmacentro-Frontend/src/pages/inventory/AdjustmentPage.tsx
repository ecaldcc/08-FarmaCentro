import { useEffect, useState, type FormEvent } from 'react';
import { http, query } from '../../api/http';
import type { Lot, Paged } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useStepUp } from '../../auth/StepUp';
import { Alert, Button, ErrorAlert, Field, PageHeader } from '../../components/ui';
import { ADJUSTMENT_LABELS, formatDate } from '../../utils/format';

/** B6 / R8 — Inventory adjustment: reason + step-up. Controlled lots only for the Regente. */
export function AdjustmentPage() {
  const { can } = useAuth();
  const { withStepUp } = useStepUp();
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState('');
  const [delta, setDelta] = useState('-1');
  const [reasonCode, setReasonCode] = useState('damaged');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const canControlled = can('inventory.adjustControlled');

  const loadLots = () =>
    http
      .get<Paged<Lot>>(`/inventory/lots${query({ pageSize: 100, includeExpired: 'true' })}`)
      .then((d) => setLots(d.items.filter((l) => canControlled || !l.isControlled)))
      .catch(setError);

  useEffect(() => {
    void loadLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lot = lots.find((l) => l.id === lotId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!lot) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const body = { lotId, quantityDelta: Number(delta), reasonCode, reason: reason.trim() };
      const result = await withStepUp(
        { action: 'inventory.adjust', targetId: lotId, label: `Ajustar lote ${lot.lotNumber} (${lot.productName ?? ''})` },
        () => http.post<{ lot: Lot }>('/inventory/adjustments', body),
      );
      setDone(`Ajuste registrado. Nueva existencia del lote ${result.lot.lotNumber}: ${result.lot.quantity}.`);
      setReason('');
      await loadLots();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Ajuste de inventario" subtitle="Requiere motivo y confirmar tu identidad; queda en la bitácora." />
      <form className="card narrow stack" onSubmit={submit}>
        {done && <Alert kind="success">{done}</Alert>}
        {!canControlled && <Alert kind="info">Los lotes de medicamentos controlados solo los ajusta el Regente.</Alert>}
        <Field label="Lote">
          {(id) => (
            <select id={id} value={lotId} onChange={(e) => setLotId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.productName} · lote {l.lotNumber} · vence {formatDate(l.expiresAt)} · existencia {l.quantity}
                  {l.isControlled ? ' · controlado' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Cantidad (negativa para sacar, positiva para agregar)">
          {(id) => <input id={id} type="number" min={-10000} max={10000} value={delta} onChange={(e) => setDelta(e.target.value)} />}
        </Field>
        <Field label="Tipo de motivo">
          {(id) => (
            <select id={id} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {Object.entries(ADJUSTMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Motivo detallado" hint="Mínimo 10 caracteres.">
          {(id) => <textarea id={id} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={!lot || Number(delta) === 0 || reason.trim().length < 10}>
          Registrar ajuste
        </Button>
      </form>
    </>
  );
}
