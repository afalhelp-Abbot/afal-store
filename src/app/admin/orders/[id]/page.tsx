import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

async function fetchOrder(id: string) {
  const supabase = getSupabaseServerClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, customer_name, email, phone, address, city, province_code, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  // Fetch order lines with variant SKU
  const { data: lines, error: linesError } = await supabase
    .from('order_lines')
    .select('id, order_id, variant_id, qty, unit_price, line_total, variants!inner(sku)')
    .eq('order_id', id);
  if (linesError) throw linesError;

  const total = (lines ?? []).reduce((sum, it: any) => sum + Number(it.line_total || 0), 0);
  return { order, items: lines ?? [], total } as const;
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

  const { order, items, total } = result;

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
                    <td className="py-2 pr-4 font-medium" colSpan={3}>Total</td>
                    <td className="py-2 pr-4 font-medium">{total.toLocaleString()} PKR</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="border rounded p-4 space-y-4">
          <h2 className="font-medium">Update Status</h2>
          <StatusForm id={String(order.id)} currentStatus={String(order.status)} />

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

  const allowed = ['pending', 'packed', 'shipped', 'cancelled'];
  if (!allowed.includes(status)) {
    return { ok: false, message: 'Invalid status' } as const;
  }

  const supabase = getSupabaseServerClient();

  // Fetch current status and items to compute inventory deltas
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

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('variant_id, qty')
    .eq('order_id', id);
  if (itemsErr) return { ok: false, message: itemsErr.message } as const;

  // Update order status first
  const { error: updErr } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id);
  if (updErr) return { ok: false, message: updErr.message } as const;

  // Compute inventory adjustments based on transition
  // Rules:
  // - pending -> cancelled: reserved -= qty
  // - pending/packed -> shipped: reserved -= qty, on_hand -= qty
  // - cancelled -> pending: reserved += qty (re-activate)
  // Other transitions: no-op
  const from = fromStatus.toLowerCase();
  const to = status.toLowerCase();

  const shouldUnreserve = (from === 'pending' && to === 'cancelled') || (from === 'pending' && to === 'shipped') || (from === 'packed' && to === 'shipped');
  const shouldShip = (to === 'shipped') && (from === 'pending' || from === 'packed');
  const shouldReReserve = (from === 'cancelled' && to === 'pending');

  for (const it of (items || [])) {
    const vid = (it as any).variant_id as string;
    const qty = Number((it as any).qty || 0);
    if (!vid || !qty) continue;

    // Read current inventory row
    const { data: cur } = await supabase
      .from('inventory')
      .select('stock_on_hand, reserved')
      .eq('variant_id', vid)
      .maybeSingle();
    let on = Number(cur?.stock_on_hand || 0);
    let res = Number(cur?.reserved || 0);

    if (shouldUnreserve) {
      res = Math.max(0, res - qty);
    }
    if (shouldReReserve) {
      res = res + qty;
    }
    if (shouldShip) {
      // Reduce physical stock; keep non-negative and not below reserved
      on = Math.max(res, on - qty);
    }

    await supabase
      .from('inventory')
      .upsert({ variant_id: vid, stock_on_hand: on, reserved: res }, { onConflict: 'variant_id' });
  }

  revalidatePath(`/admin/orders/${id}`);
  return { ok: true } as const;
}

function StatusForm({ id, currentStatus }: { id: string; currentStatus: string }) {
  return (
    <form action={updateStatusAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="block text-sm">Status</label>
        <select name="status" defaultValue={currentStatus} className="border rounded px-3 py-2 w-full">
          <option value="pending">Pending</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <button className="bg-black text-white rounded px-4 py-2">Save</button>
    </form>
  );
}
