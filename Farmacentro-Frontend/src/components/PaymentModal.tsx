import { useState } from 'react';
import { ApiError, http, query } from '../api/http';
import { formatMoney, parseQuetzales } from '../utils/format';
import {
  BILLING_ID_THRESHOLD_CENTS,
  BILLING_LABELS,
  isValidTaxId,
  normalizeTaxId,
  type BillingType,
} from '../utils/taxId';
import { Alert, Button, ErrorAlert, Field, Modal } from './ui';

export type Payment = { method: 'cash'; amountReceivedCents: number } | { method: 'card_simulated' };
export type Billing = { type: 'CF' } | { type: 'NIT' | 'CUI'; taxId: string; name?: string };

type Lookup = { state: 'idle' } | { state: 'found'; name: string } | { state: 'not_found' };

/**
 * K2 — Checkout: receipt identification (CF, NIT or DPI) and simulated payment.
 * There are intentionally no card fields. From Q2,500.00, CF is not allowed.
 */
export function PaymentModal({
  total,
  onClose,
  onPay,
}: {
  total: number;
  onClose: () => void;
  onPay: (payment: Payment, billing: Billing) => Promise<void>;
}) {
  const idRequired = total >= BILLING_ID_THRESHOLD_CENTS;
  const [billingType, setBillingType] = useState<BillingType>(idRequired ? 'NIT' : 'CF');
  const [taxId, setTaxId] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [buyerName, setBuyerName] = useState('');
  const [method, setMethod] = useState<'cash' | 'card_simulated'>('cash');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const receivedCents = parseQuetzales(received);
  const change = receivedCents !== null ? receivedCents - total : null;
  const needsId = billingType !== 'CF';
  const taxIdValid = needsId && isValidTaxId(billingType, taxId);
  const idLabel = billingType === 'CUI' ? 'DPI' : 'NIT';

  const chooseType = (type: BillingType) => {
    setBillingType(type);
    setTaxId('');
    setLookup({ state: 'idle' });
    setBuyerName('');
  };

  const searchBuyer = async () => {
    if (!needsId || !taxIdValid) return;
    setError(null);
    try {
      const found = await http.get<{ name: string }>(
        `/billing-parties/lookup${query({ type: billingType, taxId: normalizeTaxId(taxId) })}`,
      );
      setLookup({ state: 'found', name: found.name });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setLookup({ state: 'not_found' });
      else setError(e);
    }
  };

  const billingReady =
    billingType === 'CF'
      ? !idRequired
      : taxIdValid && (lookup.state === 'found' || (lookup.state === 'not_found' && buyerName.trim().length >= 3));
  const paymentReady = method === 'card_simulated' || (change !== null && change >= 0);

  const pay = async () => {
    setBusy(true);
    setError(null);
    const billing: Billing =
      billingType === 'CF'
        ? { type: 'CF' }
        : {
            type: billingType,
            taxId: normalizeTaxId(taxId),
            ...(lookup.state === 'not_found' ? { name: buyerName.trim() } : {}),
          };
    try {
      await onPay(
        method === 'cash' ? { method: 'cash', amountReceivedCents: receivedCents ?? 0 } : { method: 'card_simulated' },
        billing,
      );
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Cobrar ${formatMoney(total)}`} onClose={busy ? undefined : onClose}>
      <h3>Datos para el comprobante</h3>
      <div className="segmented" role="radiogroup" aria-label="Identificación del comprador">
        {(['CF', 'NIT', 'CUI'] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={billingType === type ? 'active' : ''}
            aria-pressed={billingType === type}
            disabled={type === 'CF' && idRequired}
            onClick={() => chooseType(type)}
          >
            {BILLING_LABELS[type]}
          </button>
        ))}
      </div>
      {idRequired && (
        <Alert kind="info">
          Desde {formatMoney(BILLING_ID_THRESHOLD_CENTS)} el comprobante debe llevar el NIT o el DPI del comprador.
        </Alert>
      )}
      {needsId && (
        <>
          <Field
            label={idLabel}
            hint={billingType === 'NIT' ? 'Con o sin guion, p. ej. 1234567-9' : '13 dígitos'}
            error={taxId && !taxIdValid ? `${idLabel} inválido: revisa el número.` : undefined}
          >
            {(id) => (
              <div className="stack-inline">
                <input
                  id={id}
                  inputMode={billingType === 'CUI' ? 'numeric' : 'text'}
                  maxLength={15}
                  value={taxId}
                  autoFocus
                  onChange={(e) => {
                    setTaxId(e.target.value);
                    setLookup({ state: 'idle' });
                  }}
                  onBlur={() => void searchBuyer()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void searchBuyer();
                    }
                  }}
                />
                <Button small variant="secondary" onClick={() => void searchBuyer()} disabled={!taxIdValid}>
                  Buscar
                </Button>
              </div>
            )}
          </Field>
          {lookup.state === 'found' && <Alert kind="success">Comprador registrado: {lookup.name}</Alert>}
          {lookup.state === 'not_found' && (
            <Field label="Nombre del comprador" hint={`El ${idLabel} no está registrado; se guardará con este nombre.`}>
              {(id) => (
                <input id={id} maxLength={150} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} autoFocus />
              )}
            </Field>
          )}
        </>
      )}

      <h3>Forma de pago</h3>
      <div className="segmented" role="radiogroup" aria-label="Forma de pago">
        <button type="button" className={method === 'cash' ? 'active' : ''} onClick={() => setMethod('cash')} aria-pressed={method === 'cash'}>
          Efectivo
        </button>
        <button
          type="button"
          className={method === 'card_simulated' ? 'active' : ''}
          onClick={() => setMethod('card_simulated')}
          aria-pressed={method === 'card_simulated'}
        >
          Tarjeta (simulada)
        </button>
      </div>
      {method === 'cash' ? (
        <>
          <Field label="Efectivo recibido (Q)">
            {(id) => <input id={id} inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />}
          </Field>
          {change !== null && change >= 0 && <p>Cambio: {formatMoney(change)}</p>}
          {change !== null && change < 0 && <small className="field-error">El efectivo no alcanza.</small>}
        </>
      ) : (
        <Alert kind="info">
          Pago simulado: en una sucursal real el cobro lo hace la terminal P2PE del procesador. Aquí solo se genera una
          referencia de autorización ficticia.
        </Alert>
      )}
      <ErrorAlert error={error} />
      <Button onClick={() => void pay()} busy={busy} disabled={!billingReady || !paymentReady}>
        {method === 'cash' ? 'Registrar pago' : 'Aprobar pago simulado'}
      </Button>
    </Modal>
  );
}
