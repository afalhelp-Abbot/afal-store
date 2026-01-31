import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/auth';
import Link from 'next/link';
import { LogsClient } from './LogsClient';

export const dynamic = 'force-dynamic';

type SearchParams = {
  event_type?: string;
  search?: string;
  page?: string;
};

async function fetchLogs(params: SearchParams) {
  const supabase = getSupabaseServerClient();
  const page = parseInt(params.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('admin_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter by event type
  if (params.event_type && params.event_type !== 'all') {
    query = query.eq('event_type', params.event_type);
  }

  // Search by entity_code (order short_code, SKU, product slug)
  if (params.search) {
    query = query.ilike('entity_code', `%${params.search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching logs:', error);
    return { logs: [], total: 0, page, totalPages: 0 };
  }

  const totalPages = Math.ceil((count || 0) / limit);

  return {
    logs: data || [],
    total: count || 0,
    page,
    totalPages,
  };
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { logs, total, page, totalPages } = await fetchLogs(searchParams);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <form method="GET" className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <select
              name="event_type"
              defaultValue={searchParams.event_type || 'all'}
              className="border rounded px-3 py-2 min-w-[180px]"
            >
              <option value="all">All Events</option>
              <option value="order_edit">Order Edits</option>
              <option value="inventory_change">Inventory Changes</option>
              <option value="product_edit">Product Edits</option>
              <option value="courier_status">Courier Status</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={searchParams.search || ''}
              placeholder="Order #, SKU, product..."
              className="border rounded px-3 py-2 w-64"
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Filter
          </button>

          {(searchParams.event_type || searchParams.search) && (
            <Link
              href="/admin/logs"
              className="text-gray-600 hover:text-gray-800 px-4 py-2"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Stats */}
      <div className="text-sm text-gray-600 mb-4">
        Showing {logs.length} of {total} logs (Page {page} of {totalPages || 1})
      </div>

      {/* Logs Table */}
      <LogsClient logs={logs} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={`/admin/logs?page=${page - 1}${searchParams.event_type ? `&event_type=${searchParams.event_type}` : ''}${searchParams.search ? `&search=${searchParams.search}` : ''}`}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Previous
            </Link>
          )}
          
          <span className="px-4 py-2 text-gray-600">
            Page {page} of {totalPages}
          </span>

          {page < totalPages && (
            <Link
              href={`/admin/logs?page=${page + 1}${searchParams.event_type ? `&event_type=${searchParams.event_type}` : ''}${searchParams.search ? `&search=${searchParams.search}` : ''}`}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
