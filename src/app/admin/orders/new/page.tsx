import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { redirect } from 'next/navigation';

function parseIntOrZero(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function parsePriceOrZero(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function createOrderAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const customer_name = String(formData.get('customer_name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const city = String(formData.get('city') || '').trim();
  const province_code = String(formData.get('province_code') || '').trim();

  if (!customer_name || !phone || !address || !city) {
    return { ok: false, message: 'Missing required fields (name, phone, address, city)' } as const;
  }

  // Collect up to 5 item rows
  const items: { qty: number; price: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const qty = parseIntOrZero(formData.get(`items[${i}][qty]`));
    const price = parsePriceOrZero(formData.get(`items[${i}][price]`));
    if (qty > 0 && price >= 0) items.push({ qty, price });
  }

  if (items.length === 0) {
    return { ok: false, message: 'Add at least one item with quantity > 0' } as const;
  }

  // Create order (default status: pending)
  const { data: order, error } = await supabase
    .from('orders')
    .insert({ customer_name, phone, email, address, city, province_code, status: 'pending' })
    .select('id')
    .maybeSingle();

  if (error || !order) {
    return { ok: false, message: error?.message || 'Failed to create order' } as const;
  }

  // Insert items
  const payload = items.map((it) => ({ order_id: order.id, qty: it.qty, price: it.price }));
  const { error: itemsError } = await supabase.from('order_items').insert(payload);
  if (itemsError) {
    return { ok: false, message: itemsError.message } as const;
  }

  redirect(`/admin/orders/${order.id}`);
}

export default async function NewOrderPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Order</h1>
        <Link className="underline" href="/admin/orders">Back to Orders</Link>
      </div>

      <form action={createOrderAction} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border rounded p-4 space-y-3 lg:col-span-2">
          <h2 className="font-medium">Customer</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm">Name</label>
              <input name="customer_name" required className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm">Phone</label>
              <input name="phone" required className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm">Email</label>
              <input name="email" type="email" className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm">City</label>
              <input name="city" required className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm">Province</label>
              <input name="province_code" className="border rounded px-3 py-2 w-full" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm">Address</label>
              <input name="address" required className="border rounded px-3 py-2 w-full" />
            </div>
          </div>

          <div className="mt-4">
            <h2 className="font-medium mb-2">Items (up to 5)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="border rounded p-3">
                  <div className="text-sm font-medium mb-2">Item {i + 1}</div>
                  <div>
                    <label className="block text-sm">Qty</label>
                    <input name={`items[${i}][qty]`} type="number" min={0} className="border rounded px-3 py-2 w-full" />
                  </div>
                  <div className="mt-2">
                    <label className="block text-sm">Price</label>
                    <input name={`items[${i}][price]`} type="number" min={0} step="0.01" className="border rounded px-3 py-2 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border rounded p-4 space-y-3">
          <h2 className="font-medium">Actions</h2>
          <p className="text-sm text-gray-600">Order will be created with status <span className="font-medium">pending</span>.</p>
          <button className="bg-black text-white rounded px-4 py-2">Create Order</button>
        </div>
      </form>

      <div className="border rounded p-4">
        <h2 className="font-medium">New Order Capabilities (This Page)</h2>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-gray-700">
          <li>Enter customer details (name, phone, email, address, city, province).</li>
          <li>Add up to 5 items with quantity and price.</li>
          <li>Creates the order with status pending and redirects to the order detail page.</li>
        </ul>
      </div>
    </div>
  );
}
