import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { http } from '../../api/http';
import type { Product } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useStepUp } from '../../auth/StepUp';
import { Alert, Badge, Button, DateTime, ErrorAlert, Field, Loading, PageHeader, ReasonDialog } from '../../components/ui';
import { formatMoney, parseQuetzales } from '../../utils/format';

const CATEGORIES = { medicamento: 'Medicamento', cuidado_personal: 'Cuidado personal', otros: 'Otros' } as const;

/** B2 (new / edit, Bodeguero) and R9 (controlled flag, Regente with step-up). */
export function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const { can } = useAuth();
  const { withStepUp } = useStepUp();
  const navigate = useNavigate();
  const editable = can('products.manage');
  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    sku: '',
    name: '',
    activeIngredient: '',
    presentation: '',
    category: 'medicamento' as keyof typeof CATEGORIES,
    price: '',
    minStock: '0',
    status: 'active' as 'active' | 'inactive',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await http.get<Product>(`/products/${id}`);
    setProduct(data);
    setForm({
      sku: data.sku,
      name: data.name,
      activeIngredient: data.activeIngredient ?? '',
      presentation: data.presentation,
      category: data.category,
      price: (data.unitPriceCents / 100).toFixed(2),
      minStock: String(data.minStock),
      status: data.status,
    });
  }, [id]);

  useEffect(() => {
    load().catch(setError);
  }, [load]);

  const priceCents = parseQuetzales(form.price);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (priceCents === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = {
      name: form.name,
      presentation: form.presentation,
      category: form.category,
      unitPriceCents: priceCents,
      minStock: Number(form.minStock),
      ...(form.activeIngredient.trim() ? { activeIngredient: form.activeIngredient.trim() } : {}),
    };
    try {
      if (isNew) {
        const created = await http.post<Product>('/products', { ...body, sku: form.sku });
        navigate(`/inventario/productos/${created.id}`, { replace: true });
      } else {
        setProduct(await http.patch<Product>(`/products/${id}`, { ...body, status: form.status }));
        setNotice('Producto actualizado.');
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!isNew && !product) return error ? <ErrorAlert error={error} /> : <Loading />;

  return (
    <>
      <PageHeader
        title={isNew ? 'Nuevo producto' : (product?.name ?? '')}
        subtitle={isNew ? 'Los productos nuevos nunca nacen como controlados.' : product?.sku}
        actions={
          product &&
          can('products.setControlled') && (
            <Button variant={product.isControlled ? 'secondary' : 'danger'} onClick={() => setToggling(true)}>
              {product.isControlled ? 'Quitar marca de controlado' : 'Marcar como controlado'}
            </Button>
          )
        }
      />
      {notice && <Alert kind="success">{notice}</Alert>}
      <div className="grid-2">
        <form className="card stack" onSubmit={submit}>
          {product && (
            <p>
              {product.isControlled ? <Badge tone="danger">Medicamento controlado</Badge> : <Badge>No controlado</Badge>}
              {!can('products.setControlled') && <span className="muted small"> · solo el Regente cambia esta marca</span>}
            </p>
          )}
          {isNew && (
            <Field label="SKU" hint="3 a 20 caracteres: letras, números o guion.">
              {(fid) => <input id={fid} maxLength={20} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} required />}
            </Field>
          )}
          <Field label="Nombre">
            {(fid) => <input id={fid} maxLength={120} disabled={!editable} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}
          </Field>
          <Field label="Principio activo">
            {(fid) => <input id={fid} maxLength={120} disabled={!editable} value={form.activeIngredient} onChange={(e) => setForm({ ...form, activeIngredient: e.target.value })} />}
          </Field>
          <Field label="Presentación">
            {(fid) => <input id={fid} maxLength={120} disabled={!editable} value={form.presentation} onChange={(e) => setForm({ ...form, presentation: e.target.value })} required />}
          </Field>
          <Field label="Categoría">
            {(fid) => (
              <select id={fid} disabled={!editable} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as keyof typeof CATEGORIES })}>
                {Object.entries(CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Precio (Q)" error={form.price && priceCents === null ? 'Formato: 12.50' : undefined}>
            {(fid) => <input id={fid} inputMode="decimal" disabled={!editable} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />}
          </Field>
          <Field label="Existencia mínima">
            {(fid) => <input id={fid} type="number" min={0} disabled={!editable} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />}
          </Field>
          {!isNew && (
            <Field label="Estado">
              {(fid) => (
                <select id={fid} disabled={!editable} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              )}
            </Field>
          )}
          <ErrorAlert error={error} />
          {editable && (
            <Button type="submit" busy={busy} disabled={priceCents === null}>
              {isNew ? 'Crear producto' : 'Guardar cambios'}
            </Button>
          )}
        </form>
        {product && (
          <section className="card">
            <h2>Lotes</h2>
            <p>
              Existencia vendible: <strong>{product.stock}</strong> · precio {formatMoney(product.unitPriceCents)}
            </p>
            {product.lots && product.lots.length > 0 ? (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Vence</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {product.lots.map((l) => (
                    <tr key={l.id}>
                      <td>{l.lotNumber}</td>
                      <td>
                        <DateTime value={l.expiresAt} /> {l.expired && <Badge tone="danger">Vencido</Badge>}
                      </td>
                      <td>{l.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Sin lotes con existencia.</p>
            )}
          </section>
        )}
      </div>
      {toggling && product && (
        <ReasonDialog
          title={product.isControlled ? 'Quitar marca de controlado' : 'Marcar como controlado'}
          description={<p>Los controlados solo pueden despacharse con receta y re-autenticación.</p>}
          confirmLabel="Confirmar"
          danger
          onClose={() => setToggling(false)}
          onConfirm={async (reason) => {
            const updated = await withStepUp(
              { action: 'product.controlled.change', targetId: product.id, label: `Cambiar marca de controlado (${product.sku})` },
              () => http.put<Product>(`/products/${product.id}/controlled`, { isControlled: !product.isControlled, reason }),
            );
            setProduct(updated);
            setNotice('Marca de controlado actualizada.');
          }}
        />
      )}
    </>
  );
}
