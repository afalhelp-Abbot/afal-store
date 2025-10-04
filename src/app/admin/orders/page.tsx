import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';

type Search = { q?: string; status?: string };

async function fetchOrders(search: Search) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from('orders')
    .select('id, status, customer_name, email, phone, address, city, province_code, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (search.status && search.status !== 'all') {
    query = query.eq('status', search.status);
  }
  if (search.q && search.q.trim()) {
    const q = `%${search.q.trim()}%`;
    // Search by name, email or phone
    query = query.or(`customer_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
  }
  const { data, error } = await query;
  if (error) throw error;

  const ids = (data ?? []).map((o) => o.id);
  if (ids.length === 0) return [] as any[];

  // Fetch totals per order from order_lines (preferred: sum of line_total)
  const { data: lines } = await supabase
    .from('order_lines')
    .select('order_id, line_total')
    .in('order_id', ids);

  const totals: Record<string, number> = {};
  for (const ln of lines ?? []) {
    const key = String((ln as any).order_id);
    totals[key] = (totals[key] ?? 0) + Number((ln as any).line_total || 0);
  }
  return (data ?? []).map((o) => ({ ...o, total: totals[String(o.id)] ?? 0 }));
}

export default async function OrdersPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const orders = await fetchOrders(searchParams || {});
  const currentStatus = searchParams?.status ?? 'all';
  const q = searchParams?.q ?? '';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <div className="border rounded p-4">
        <h2 className="font-medium">Orders Capabilities (This Page)</h2>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-gray-700">
          <li>View orders with filters and quick search.</li>
          <li>Open an order to see items and update status.</li>
          <li>Print a packing slip from the order detail.</li>
        </ul>
      </div>

      <form className="flex flex-wrap items-end gap-3 border rounded p-4" action="/admin/orders" method="get">
        <div>
          <label className="block text-sm">Status</label>
          <select name="status" defaultValue={currentStatus} className="border rounded px-3 py-2">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm">Search</label>
          <input name="q" defaultValue={q} placeholder="Name or Phone" className="border rounded px-3 py-2 w-full" />
        </div>
        <button className="bg-black text-white rounded px-4 py-2">Apply</button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">City</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4"><Link className="underline" href={`/admin/orders/${o.id}`}>#{o.id}</Link></td>
                <td className="py-2 pr-4">{o.customer_name}</td>
                <td className="py-2 pr-4">{o.email || '-'}</td>
                <td className="py-2 pr-4">{o.phone}</td>
                <td className="py-2 pr-4">{o.city} {o.province_code ? `(${o.province_code})` : ''}</td>
                <td className="py-2 pr-4 capitalize">{o.status}</td>
                <td className="py-2 pr-4">{Number(o.total).toLocaleString()} PKR</td>
                <td className="py-2 pr-4">{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="py-4 text-gray-500" colSpan={7}>No orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
