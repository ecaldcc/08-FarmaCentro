import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError, http, query } from '../../api/http';
import type { CustomerSummary, Paged, Product, Sale } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, Empty, ErrorAlert, Field, Modal, Money, PageHeader } from '../../components/ui';
import { formatMoney, parseQuetzales } from '../../utils/format';

interface CartLine {
  product: Product;
  quantity: number;
}

/** K1 / R1 — Counter sale. Controlled medicines are dispensed only from a prescription. */
export function PosPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [phone, setPhone] = useState('');
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    const handle = window.setTimeout(() => {
      http
        .get<Paged<Product>>(`/products${query({ q: term, pageSize: 10 })}`)
        .then((data) => setResults(data.items))
        .catch(setError);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const total = cart.reduce((sum, line) => sum + line.quantity * line.product.unitPriceCents, 0);

  const add = (product: Product) => {
    setCart((lines) => {
      const existing = lines.find((l) => l.product.id === product.id);
      if (existing) {
        return lines.map((l) => (l.product.id === product.id ? { ...l, quantity: Math.min(l.quantity + 1, product.stock) } : l));
      }
      return [...lines, { product, quantity: 1 }];
    });
  };

  const setQuantity = (productId: string, quantity: number) => {
    setCart((lines) =>
      lines.map((l) => (l.product.id === productId ? { ...l, quantity: Math.max(1, Math.min(quantity, l.product.stock)) } : l)),
    );
  };

  const findCustomer = async () => {
    setCustomerError(null);
    try {
      setCustomer(await http.get<CustomerSummary>(`/customers/lookup${query({ phone })}`));
    } catch (e) {
      setCustomer(null);
      setCustomerError(e instanceof ApiError && e.status === 404 ? 'No hay un cliente con ese teléfono.' : 'No se pudo buscar el cliente.');
    }
  };

  return (
    <>
      <PageHeader title="Punto de venta" subtitle="Pago simulado: el sistema nunca pide ni guarda datos de tarjeta" />
      <div className="pos-layout">
        <section className="card">
          <Field label="Buscar producto (nombre, SKU o principio activo)">
            {(id) => <input id={id} value={search} maxLength={50} onChange={(e) => setSearch(e.target.value)} autoFocus />}
          </Field>
          {results.length === 0 && search.trim().length >= 2 && <Empty>Sin resultados.</Empty>}
          <ul className="product-results">
            {results.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong> <span className="muted">{p.sku}</span>
                  <div className="muted small">
                    {p.presentation} · existencia {p.stock}
                  </div>
                </div>
                <div className="result-actions">
                  <Money cents={p.unitPriceCents} />
                  {p.isControlled ? (
                    <span className="stack-inline">
                      <Badge tone="danger">Controlado</Badge>
                      {can('prescriptions.manage') ? (
                        <Link to="/recetas" className="small">
                          Despachar con receta
                        </Link>
                      ) : (
                        <span className="small muted">Requiere despacho por el Regente</span>
                      )}
                    </span>
                  ) : (
                    <Button small onClick={() => add(p)} disabled={p.stock === 0}>
                      {p.stock === 0 ? 'Sin existencia' : 'Agregar'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Venta</h2>
          {cart.length === 0 ? (
            <Empty>Agrega productos para iniciar la venta.</Empty>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Subtotal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.product.id}>
                    <td>{line.product.name}</td>
                    <td>
                      <input
                        type="number"
                        className="qty"
                        min={1}
                        max={line.product.stock}
                        value={line.quantity}
                        aria-label={`Cantidad de ${line.product.name}`}
                        onChange={(e) => setQuantity(line.product.id, Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <Money cents={line.quantity * line.product.unitPriceCents} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Quitar ${line.product.name}`}
                        onClick={() => setCart((lines) => lines.filter((l) => l.product.id !== line.product.id))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="total-row">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>

          <div className="customer-box">
            <h3>Cliente de fidelización (opcional)</h3>
            {customer ? (
              <div className="stack-inline">
                <span>
                  {customer.fullName} · {customer.phoneMasked} · {customer.pointsBalance} puntos
                </span>
                <Button small variant="ghost" onClick={() => setCustomer(null)}>
                  Quitar
                </Button>
              </div>
            ) : (
              <div className="stack-inline">
                <input
                  placeholder="Teléfono (8 dígitos)"
                  inputMode="numeric"
                  maxLength={8}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  aria-label="Teléfono del cliente"
                />
                <Button small variant="secondary" onClick={() => void findCustomer()} disabled={phone.length !== 8}>
                  Buscar
                </Button>
                <Link to="/clientes/nuevo" className="small">
                  Registrar cliente
                </Link>
              </div>
            )}
            {customerError && <small className="field-error">{customerError}</small>}
          </div>

          <ErrorAlert error={error} />
          <Button onClick={() => setPaying(true)} disabled={cart.length === 0}>
            Cobrar
          </Button>
        </section>
      </div>

      {paying && (
        <PaymentModal
          total={total}
          onClose={() => setPaying(false)}
          onPay={async (payment) => {
            const sale = await http.post<Sale>('/sales', {
              ...(customer ? { customerId: customer.id } : {}),
              items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
              payment,
            });
            navigate(`/ventas/${sale.id}/comprobante`);
          }}
        />
      )}
    </>
  );
}

type Payment = { method: 'cash'; amountReceivedCents: number } | { method: 'card_simulated' };

/** K2 — Simulated payment. There are intentionally no card fields. */
export function PaymentModal({
  total,
  onClose,
  onPay,
}: {
  total: number;
  onClose: () => void;
  onPay: (payment: Payment) => Promise<void>;
}) {
  const [method, setMethod] = useState<'cash' | 'card_simulated'>('cash');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const receivedCents = parseQuetzales(received);
  const change = receivedCents !== null ? receivedCents - total : null;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await onPay(method === 'cash' ? { method: 'cash', amountReceivedCents: receivedCents ?? 0 } : { method: 'card_simulated' });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Cobrar ${formatMoney(total)}`} onClose={busy ? undefined : onClose}>
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
            {(id) => <input id={id} inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} autoFocus />}
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
      <Button onClick={() => void pay()} busy={busy} disabled={method === 'cash' && (change === null || change < 0)}>
        {method === 'cash' ? 'Registrar pago' : 'Aprobar pago simulado'}
      </Button>
    </Modal>
  );
}
