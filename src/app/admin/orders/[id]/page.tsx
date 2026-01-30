import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { StatusFormClient } from './StatusFormClient';
import { CourierFormClient } from './CourierFormClient';
import { LeopardsBookingClient } from './LeopardsBookingClient';

async function fetchOrder(id: string) {
  const supabase = getSupabaseServerClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, short_code, status, customer_name, email, phone, address, city, province_code, created_at, shipping_amount, discount_total, promo_name, courier_id, courier_tracking_number, courier_notes, courier_booked_at, couriers(id, name, api_type)')
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

  // Fetch couriers for dropdown
  const supabase = getSupabaseServerClient();
  const { data: couriers } = await supabase
    .from('couriers')
    .select('id, name, api_type')
    .eq('is_active', true)
    .order('name', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order #{order.short_code || order.id}</h1>
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

          {/* Courier Info Display */}
          {(order.courier_id || order.courier_tracking_number) && (
            <div className="bg-gray-50 rounded p-3">
              <h2 className="font-medium mb-2">Courier</h2>
              <div className="text-sm space-y-1">
                <div><span className="text-gray-600">Courier:</span> {order.couriers?.name || '—'}</div>
                {order.courier_tracking_number && (
                  <div><span className="text-gray-600">CN/Tracking:</span> {order.courier_tracking_number}</div>
                )}
                {order.courier_notes && (
                  <div><span className="text-gray-600">Notes:</span> {order.courier_notes}</div>
                )}
              </div>
            </div>
          )}

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
          <StatusFormClient id={String(order.id)} currentStatus={String(order.status)} items={items as any[]} />

          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">Shipping / Courier</h3>
            <CourierFormClient
              orderId={String(order.id)}
              currentCourierId={order.courier_id || ''}
              currentTrackingNumber={order.courier_tracking_number || ''}
              currentNotes={order.courier_notes || ''}
              couriers={(couriers ?? []) as any[]}
            />
          </div>

          {/* Leopards Booking */}
          {order.courier_id && (order.couriers as any)?.api_type === 'leopards' && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-2">Courier Booking</h3>
              <LeopardsBookingClient
                orderId={String(order.id)}
                courierApiType={(order.couriers as any)?.api_type || null}
                hasTrackingNumber={!!order.courier_tracking_number}
                trackingNumber={order.courier_tracking_number || null}
                bookedAt={order.courier_booked_at || null}
              />
            </div>
          )}

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
