import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

async function fetchOrder(id: string) {
  const supabase = getSupabaseServerClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, customer_name, email, phone, address, city, province_code, created_at, shipping_amount, discount_total, promo_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  // Fetch order lines with variant SKU
  const { data: lines, error: linesError } = await supabase
    .from('order_lines')
    .select('id, order_id, variant_id, qty, unit_price, line_total, variants!inner(sku), return_status, return_condition')
    .eq('order_id', id);
  if (linesError) throw linesError;

  const subtotal = (lines ?? []).reduce((sum, it: any) => sum + Number(it.line_total || 0), 0);
  const shipping = Number((order as any).shipping_amount || 0);
  const discount = Number((order as any).discount_total || 0);
  const total = subtotal + shipping - discount;
  return { order, items: lines ?? [], total, subtotal, shipping, discount } as const;
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const id = params.id;
  const result = await fetchOrder(id);

  if (!result) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Order #{id}</h1>
        <p className="text-gray-600">Order not found.</p>
        <Link className="underline" href="/admin/orders">Back to Orders</Link>
      </div>
    );
  }

  const { order, items, total, subtotal, shipping, discount } = result as any;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order #{order.id}</h1>
        <Link className="underline" href="/admin/orders">Back to Orders</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border rounded p-4 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Created</div>
              <div className="font-medium">{new Date(order.created_at as any).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className="font-medium capitalize">{order.status}</div>
            </div>
          </div>

          <div>
            <h2 className="font-medium mb-2">Customer</h2>
            <div className="text-sm">
              <div className="font-medium">{order.customer_name}</div>
              <div>{order.email || '-'}</div>
              <div>{order.phone}</div>
              <div>{order.address}</div>
              <div>
                {order.city} {order.province_code ? `(${order.province_code})` : ''}
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-medium mb-2">Items</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
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
                      <td className="py-2 pr-4">{it.variants?.sku || it.variant_id}</td>
                      <td className="py-2 pr-4">{it.qty}</td>
                      <td className="py-2 pr-4">{Number(it.unit_price).toLocaleString()} PKR</td>
                      <td className="py-2 pr-4">{Number(it.line_total).toLocaleString()} PKR</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="py-2 pr-4" colSpan={3}>Items subtotal</td>
                    <td className="py-2 pr-4">{Number(subtotal || 0).toLocaleString()} PKR</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4" colSpan={3}>Shipping</td>
                    <td className="py-2 pr-4">{Number(shipping || 0).toLocaleString()} PKR</td>
                  </tr>
                  {Number(discount || 0) > 0 && (
                    <tr>
                      <td className="py-2 pr-4 text-green-700" colSpan={3}>
                        {order.promo_name || 'Promotion discount'}
                      </td>
                      <td className="py-2 pr-4 text-green-700">- {Number(discount || 0).toLocaleString()} PKR</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-2 pr-4 font-medium" colSpan={3}>Total</td>
                    <td className="py-2 pr-4 font-medium">{Number(total || 0).toLocaleString()} PKR</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="border rounded p-4 space-y-4">
          <h2 className="font-medium">Update Status</h2>
          <StatusForm id={String(order.id)} currentStatus={String(order.status)} items={items as any[]} />

          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">Actions</h3>
            <div className="flex items-center gap-3 text-sm">
              <Link className="underline" href={`/admin/orders/${order.id}/packing-slip`}>Print Packing Slip</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function updateStatusAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  await requireAdmin();

  if (!id || !status) {
    return { ok: false, message: 'Missing id or status' } as const;
  }

  const allowed = ['pending', 'packed', 'shipped', 'return_in_transit', 'cancelled', 'returned'];
  if (!allowed.includes(status)) {
    return { ok: false, message: 'Invalid status' } as const;
  }

  const supabase = getSupabaseServerClient();

  // Fetch current status for transition validation
  const { data: existing, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return { ok: false, message: fetchErr.message } as const;
  const fromStatus = String(existing?.status || 'pending');

  // If no change, do nothing
  if (fromStatus === status) {
    return { ok: true } as const;
  }

  const from = fromStatus.toLowerCase();
  const to = status.toLowerCase();

  // Enforce high-level transition rules
  // - shipped -> cancelled: not allowed (no inventory change should happen)
  // - returned -> anything else: not allowed (terminal state)
  if (from === 'shipped' && to === 'cancelled') {
    return { ok: false, message: 'Cannot change shipped orders back to cancelled.' } as const;
  }
  if (from === 'returned' && to !== 'returned') {
    return { ok: false, message: `Cannot move returned orders to ${to}.` } as const;
  }
  // Returned can only be set from shipped or return_in_transit
  if (to === 'returned' && !(from === 'shipped' || from === 'return_in_transit')) {
    return { ok: false, message: 'Returned status is only allowed from Shipped or Return in transit.' } as const;
  }

  // Collect per-line return conditions when marking as returned (from shipped or return_in_transit)
  let returnLines: Record<string, { condition: 'resellable' | 'not_resellable' }> | null = null;
  if (to === 'returned') {
    returnLines = {};
    for (const [key, value] of Array.from(formData.entries())) {
      const match = /^item\[(.+)\]\[return_condition\]$/.exec(String(key));
      if (!match) continue;
      const lineId = match[1];
      const cond = String(value);
      if (cond === 'resellable' || cond === 'not_resellable') {
        returnLines[lineId] = { condition: cond };
      }
    }
  }

  // Delegate all inventory math + status update to Postgres RPC
  const { error: rpcError } = await supabase.rpc('adjust_inventory_for_order_status', {
    p_order_id: id,
    p_from_status: fromStatus,
    p_to_status: status,
    p_return_lines: returnLines,
  });
  if (rpcError) {
    return { ok: false, message: rpcError.message } as const;
  }

  revalidatePath(`/admin/orders/${id}`);
  return { ok: true } as const;
}

function StatusForm({ id, currentStatus, items }: { id: string; currentStatus: string; items: any[] }) {
  return (
    <form action={updateStatusAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="block text-sm">Status</label>
        <select name="status" defaultValue={currentStatus} className="border rounded px-3 py-2 w-full">
          <option value="pending">Pending</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="return_in_transit">Return in transit</option>
          <option value="cancelled">Cancelled</option>
          <option value="returned">Returned</option>
        </select>
      </div>
      <div className="space-y-2 text-sm border-t pt-3">
        <div className="font-medium">Return condition (used when marking as Returned)</div>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {items.map((it: any) => (
            <div key={it.id} className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <div className="font-mono text-xs">{it.variants?.sku || it.variant_id}</div>
                <div className="text-gray-600 text-xs">Qty: {it.qty}</div>
              </div>
              <select
                name={`item[${it.id}][return_condition]`}
                defaultValue={it.return_condition || ''}
                className="border rounded px-2 py-1 text-xs"
              >
                <option value="">--</option>
                <option value="resellable">Resellable</option>
                <option value="not_resellable">Not resellable</option>
              </select>
            </div>
          ))}
        </div>
      </div>
      <button className="bg-black text-white rounded px-4 py-2">Save</button>
    </form>
  );
}
