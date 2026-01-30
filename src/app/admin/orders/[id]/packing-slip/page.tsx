import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { PrintButton } from './PrintButton';

async function fetchOrderForSlip(id: string) {
  const supabase = getSupabaseServerClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, short_code, status, customer_name, email, phone, address, city, province_code, created_at, shipping_amount, discount_total, promo_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const { data: lines, error: linesError } = await supabase
    .from('order_lines')
    .select('id, order_id, variant_id, qty, unit_price, line_total, variants!inner(sku)')
    .eq('order_id', id);
  if (linesError) throw linesError;

  const subtotal = (lines ?? []).reduce((sum, it: any) => sum + Number(it.line_total || 0), 0);
  const shipping = Number((order as any).shipping_amount || 0);
  const discount = Number((order as any).discount_total || 0);
  const total = subtotal + shipping - discount;
  return { order, items: lines ?? [], subtotal, shipping, discount, total } as const;
}

export default async function PackingSlipPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const id = params.id;
  const result = await fetchOrderForSlip(id);

  if (!result) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Packing Slip</h1>
        <p className="text-gray-600">Order not found.</p>
      </div>
    );
  }

  const { order, items, subtotal, shipping, discount, total } = result;

  return (
    <div className="p-6">
      {/* Screen-only toolbar */}
      <div className="mb-6 print:hidden flex items-center gap-3">
        <PrintButton />
        <a href={`/admin/orders/${order.id}`} className="underline">Back to Order</a>
      </div>

      {/* Printable content */}
      <div className="max-w-3xl mx-auto border rounded p-6 print:border-0">
        <div>
          <h1 className="text-xl font-semibold">Packing Slip</h1>
          <div className="text-sm text-gray-600">Order #{(order as any).short_code || order.id}</div>
          <div className="text-sm text-gray-600">Created {new Date(order.created_at as any).toLocaleString()}</div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="font-medium">Ship To</h2>
            <div className="text-sm mt-1">
              <div className="font-medium">{order.customer_name}</div>
              <div>{order.phone}</div>
              <div>{order.email || '-'}</div>
              <div>{order.address}</div>
              <div>
                {order.city} {order.province_code ? `(${order.province_code})` : ''}
              </div>
            </div>
          </div>
          <div>
            <h2 className="font-medium">From</h2>
            <div className="text-sm mt-1">
              <div className="font-medium">Afal Store</div>
              <div>support@afalstore.com</div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">Qty</th>
                <th className="py-2 pr-4">Unit Price</th>
                <th className="py-2 pr-4">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className="border-b">
                  <td className="py-2 pr-4">{it.variants?.sku || '-'}</td>
                  <td className="py-2 pr-4">{it.qty}</td>
                  <td className="py-2 pr-4">{Number(it.unit_price).toLocaleString()} PKR</td>
                  <td className="py-2 pr-4">{Number(it.line_total).toLocaleString()} PKR</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-4" colSpan={3}>Items Subtotal</td>
                <td className="py-2 pr-4">{subtotal.toLocaleString()} PKR</td>
              </tr>
              <tr>
                <td className="py-2 pr-4" colSpan={3}>Shipping</td>
                <td className="py-2 pr-4">{shipping.toLocaleString()} PKR</td>
              </tr>
              {discount > 0 && (
                <tr>
                  <td className="py-2 pr-4" colSpan={3}>Discount {(order as any).promo_name ? `(${(order as any).promo_name})` : ''}</td>
                  <td className="py-2 pr-4 text-green-600">-{discount.toLocaleString()} PKR</td>
                </tr>
              )}
              <tr className="border-t">
                <td className="py-2 pr-4 font-medium" colSpan={3}>Total</td>
                <td className="py-2 pr-4 font-medium">{total.toLocaleString()} PKR</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <style>{`
          @media print {
            .print\\:hidden { display: none !important; }
            .print\\:border-0 { border: 0 !important; }
            body { background: #fff; }
          }
        `}</style>
      </div>
    </div>
  );
}
