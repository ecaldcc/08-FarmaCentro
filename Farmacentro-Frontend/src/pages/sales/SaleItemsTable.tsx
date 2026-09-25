import type { Sale } from '../../api/types';
import { Money } from '../../components/ui';

export function SaleItemsTable({ sale }: { sale: Sale }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Producto</th>
          <th>Cantidad</th>
          <th>Precio</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {sale.items.map((item, index) => (
          <tr key={`${item.productId}-${item.lotId}-${index}`}>
            <td>{item.sku}</td>
            <td>{item.name}</td>
            <td>{item.quantity}</td>
            <td>
              <Money cents={item.unitPriceCents} />
            </td>
            <td>
              <Money cents={item.lineTotalCents} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>Total</td>
          <td>
            <Money cents={sale.totalCents} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
