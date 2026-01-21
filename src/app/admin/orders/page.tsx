import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';

type Search = { q?: string; status?: string; productId?: string; from?: string; to?: string; page?: string };

async function fetchOrders(search: Search) {
  const supabase = getSupabaseServerClient();
  const pageSize = 50;
  const currentPage = Math.max(1, Number(search.page || '1') || 1);
  const fromIndex = (currentPage - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  let query = supabase
    .from('orders')
    .select('id, status, customer_name, email, phone, address, city, province_code, created_at, shipping_amount, discount_total', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search.status && search.status !== 'all') {
    query = query.eq('status', search.status);
  }
  if (search.from) {
    // Interpret from/to as dates in local (Asia/Karachi) but store as UTC timestamps; here we compare on date string
    query = query.gte('created_at', `${search.from}T00:00:00`);
  }
  if (search.to) {
    query = query.lte('created_at', `${search.to}T23:59:59.999`);
  }
  if (search.q && search.q.trim()) {
    const q = `%${search.q.trim()}%`;
    // Search by name, email or phone
    query = query.or(`customer_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
  }
  // Filter by product via order_lines -> variants.product_id
  if (search.productId && search.productId !== 'all') {
    const { data: lineOrders, error: lineErr } = await supabase
      .from('order_lines')
      .select('order_id, variants!inner(id, product_id)')
      .eq('variants.product_id', search.productId);
    if (lineErr) throw lineErr;
    const orderIds = Array.from(new Set((lineOrders ?? []).map((r: any) => r.order_id)));
    if (orderIds.length === 0) {
      return { orders: [] as any[], totalCount: 0 } as const;
    }
    query = query.in('id', orderIds);
  }
  const { data, error, count } = await query.range(fromIndex, toIndex);
  if (error) throw error;

  const ids = (data ?? []).map((o) => o.id);
  if (ids.length === 0) return { orders: [] as any[], totalCount: count ?? 0 } as const;

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
  const ordersWithTotals = (data ?? []).map((o) => ({
    ...o,
    total:
      (totals[String(o.id)] ?? 0) +
      Number((o as any).shipping_amount || 0) -
      Number((o as any).discount_total || 0),
  }));

  return { orders: ordersWithTotals, totalCount: count ?? ordersWithTotals.length } as const;
}

export default async function OrdersPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();
  let orders: any[] = [];
  let totalCount = 0;
  let fetchError: any = null;
  try {
    const result = await fetchOrders(searchParams || {});
    orders = result.orders;
    totalCount = result.totalCount;
  } catch (e: any) {
    fetchError = e;
  }
  const totalOrders = orders.length;
  // Exclude cancelled orders from revenue summary
  const totalRevenue = orders
    .filter((o: any) => String(o.status).toLowerCase() !== 'cancelled')
    .reduce((sum, o: any) => sum + Number(o.total || 0), 0);
  const currentStatus = searchParams?.status ?? 'all';
  const q = searchParams?.q ?? '';
  const currentProduct = searchParams?.productId ?? 'all';
  const currentFrom = searchParams?.from ?? '';
  const currentTo = searchParams?.to ?? '';
  const currentPage = Math.max(1, Number(searchParams?.page || '1') || 1);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Fetch products for the dropdown
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .order('created_at', { ascending: false });

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
            <option value="return_in_transit">Return in transit</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Product</label>
          <select name="productId" defaultValue={currentProduct} className="border rounded px-3 py-2 min-w-[220px]">
            <option value="all">All products</option>
            {(products ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm">Search</label>
          <input name="q" defaultValue={q} placeholder="Name or Phone" className="border rounded px-3 py-2 w-full" />
        </div>
        <div>
          <label className="block text-sm">From date</label>
          <input
            type="date"
            name="from"
            defaultValue={currentFrom}
            className="border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm">To date</label>
          <input
            type="date"
            name="to"
            defaultValue={currentTo}
            className="border rounded px-3 py-2"
          />
        </div>
        <button className="bg-black text-white rounded px-4 py-2">Apply</button>
      </form>

      {fetchError && (
        <div className="border rounded p-3 text-sm text-red-700 bg-red-50">
          Error loading orders: {String(fetchError?.message || fetchError)}
        </div>
      )}
      {!fetchError && (
        <div className="border rounded p-3 text-sm bg-gray-50 flex flex-wrap gap-4 justify-between items-center">
          <div>
            <span className="font-medium">Total orders:</span> {totalOrders}
          </div>
          <div>
            <span className="font-medium">Total revenue:</span> {Number(totalRevenue).toLocaleString()} PKR
          </div>
          <div className="text-xs text-gray-600">
            Page {currentPage} of {totalPages} (overall matching orders: {totalCount})
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">#</th>
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
            {orders.map((o: any, index: number) => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="py-2 pr-4"><Link className="underline" href={`/admin/orders/${o.id}`}>#{o.id}</Link></td>
                <td className="py-2 pr-4">{o.customer_name}</td>
                <td className="py-2 pr-4">{o.email || '-'}</td>
                <td className="py-2 pr-4">{o.phone}</td>
                <td className="py-2 pr-4">{o.city} {o.province_code ? `(${o.province_code})` : ''}</td>
                <td className="py-2 pr-4 capitalize">{o.status}</td>
                <td className="py-2 pr-4">{Number(o.total).toLocaleString()} PKR</td>
                <td className="py-2 pr-4">
                  {new Date(o.created_at).toLocaleString('en-PK', {
                    timeZone: 'Asia/Karachi',
                  })}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="py-4 text-gray-500" colSpan={8}>No orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!fetchError && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div>
            Showing page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/admin/orders?${new URLSearchParams({
                  ...(currentStatus !== 'all' ? { status: String(currentStatus) } : {}),
                  ...(currentProduct !== 'all' ? { productId: String(currentProduct) } : {}),
                  ...(q ? { q: String(q) } : {}),
                  ...(currentFrom ? { from: String(currentFrom) } : {}),
                  ...(currentTo ? { to: String(currentTo) } : {}),
                  page: String(currentPage - 1),
                }).toString()}`}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/admin/orders?${new URLSearchParams({
                  ...(currentStatus !== 'all' ? { status: String(currentStatus) } : {}),
                  ...(currentProduct !== 'all' ? { productId: String(currentProduct) } : {}),
                  ...(q ? { q: String(q) } : {}),
                  ...(currentFrom ? { from: String(currentFrom) } : {}),
                  ...(currentTo ? { to: String(currentTo) } : {}),
                  page: String(currentPage + 1),
                }).toString()}`}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
