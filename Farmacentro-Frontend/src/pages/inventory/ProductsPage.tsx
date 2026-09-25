import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { http, query } from '../../api/http';
import type { Paged, Product } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Empty, ErrorAlert, Loading, Money, PageHeader, Pagination } from '../../components/ui';

/** B1 / R7 — Products and stock. */
export function ProductsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<Paged<Product> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [controlled, setControlled] = useState<'' | 'true' | 'false'>('');
  const [lowStock, setLowStock] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      http
        .get<Paged<Product>>(`/products${query({ page, q: q.trim(), isControlled: controlled, lowStock: lowStock ? 'true' : undefined })}`)
        .then(setData)
        .catch(setError);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [page, q, controlled, lowStock]);

  return (
    <>
      <PageHeader
        title="Inventario"
        actions={
          <>
            {can('inventory.receive') && (
              <Link to="/inventario/entradas/nueva" className="btn btn-secondary">
                Entrada de mercadería
              </Link>
            )}
            {can('inventory.adjust') && (
              <Link to="/inventario/ajustes/nuevo" className="btn btn-secondary">
                Ajuste
              </Link>
            )}
            {can('products.manage') && (
              <Link to="/inventario/productos/nuevo" className="btn btn-primary">
                Nuevo producto
              </Link>
            )}
          </>
        }
      />
      <div className="filters">
        <input placeholder="Buscar por nombre, SKU o principio activo" maxLength={50} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={controlled} onChange={(e) => { setControlled(e.target.value as '' | 'true' | 'false'); setPage(1); }} aria-label="Controlados">
          <option value="">Todos</option>
          <option value="true">Solo controlados</option>
          <option value="false">No controlados</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={lowStock} onChange={(e) => { setLowStock(e.target.checked); setPage(1); }} /> Existencia baja
        </label>
      </div>
      <ErrorAlert error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>No hay productos.</Empty>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Presentación</th>
                <th>Precio</th>
                <th>Existencia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>
                    <Link to={`/inventario/productos/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.presentation}</td>
                  <td>
                    <Money cents={p.unitPriceCents} />
                  </td>
                  <td>
                    {p.stock} {p.lowStock && <Badge tone="warning">Baja</Badge>}
                  </td>
                  <td>{p.isControlled && <Badge tone="danger">Controlado</Badge>}</td>
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
