import { useEffect, useState, type FormEvent } from 'react';
import { http, query } from '../../api/http';
import type { Lot, Paged, Product } from '../../api/types';
import { Alert, Button, ErrorAlert, Field, PageHeader } from '../../components/ui';
import { todayGt } from '../../utils/format';

/** B4 — Goods receipt (new lot or more units of an existing lot). */
export function ReceiptFormPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState(todayGt(365));
  const [quantity, setQuantity] = useState('1');
  const [supplier, setSupplier] = useState('');
  const [documentRef, setDocumentRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<Lot | null>(null);

  useEffect(() => {
    http
      .get<Paged<Product>>(`/products${query({ pageSize: 100 })}`)
      .then((d) => setProducts(d.items))
      .catch(setError);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await http.post<{ lot: Lot }>('/inventory/receipts', {
        productId,
        lotNumber: lotNumber.trim(),
        expiresAt,
        quantity: Number(quantity),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(documentRef.trim() ? { documentRef: documentRef.trim() } : {}),
      });
      setDone(result.lot);
      setLotNumber('');
      setQuantity('1');
      setDocumentRef('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Entrada de mercadería" />
      <form className="card narrow stack" onSubmit={submit}>
        {done && (
          <Alert kind="success">
            Entrada registrada: lote {done.lotNumber}, existencia {done.quantity}.
          </Alert>
        )}
        <Field label="Producto">
          {(id) => (
            <select id={id} value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}){p.isControlled ? ' · controlado' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Número de lote">{(id) => <input id={id} maxLength={40} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} required />}</Field>
        <Field label="Fecha de vencimiento">{(id) => <input id={id} type="date" min={todayGt(1)} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />}</Field>
        <Field label="Cantidad">{(id) => <input id={id} type="number" min={1} max={10000} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />}</Field>
        <Field label="Droguería (opcional)">{(id) => <input id={id} maxLength={100} value={supplier} onChange={(e) => setSupplier(e.target.value)} />}</Field>
        <Field label="Documento de respaldo (opcional)">{(id) => <input id={id} maxLength={40} value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} />}</Field>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={!productId || !lotNumber.trim() || Number(quantity) < 1}>
          Registrar entrada
        </Button>
      </form>
    </>
  );
}
