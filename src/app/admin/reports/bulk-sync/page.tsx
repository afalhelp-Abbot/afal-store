import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { BulkSyncClient } from './BulkSyncClient';

export default async function BulkSyncPage() {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // Get M&P orders that can be synced (shipped, return_in_transit with tracking number)
  const { data: orders, count } = await supabase
    .from('orders')
    .select('id, short_code, status, courier_tracking_number, customer_name, created_at, couriers!inner(id, name, api_type)', { count: 'exact' })
    .eq('couriers.api_type', 'mnp')
    .not('courier_tracking_number', 'is', null)
    .in('status', ['shipped', 'packed', 'return_in_transit'])
    .order('created_at', { ascending: false })
    .limit(100);

  // Get last bulk sync
  const { data: lastSync } = await supabase
    .from('courier_sync_logs')
    .select('*')
    .eq('sync_type', 'bulk_tracking')
    .eq('courier_api_type', 'mnp')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bulk Status Sync</h1>
          <p className="text-gray-600 text-sm mt-1">
            Sync tracking status for all M&P orders at once
          </p>
        </div>
        <Link href="/admin/reports" className="text-sm underline">
          ← Back to Reports
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 bg-blue-50">
          <div className="text-sm text-blue-700">Orders to Sync</div>
          <div className="text-2xl font-bold text-blue-800">{count || 0}</div>
          <div className="text-xs text-blue-600 mt-1">shipped, packed, return_in_transit</div>
        </div>
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="text-sm text-gray-700">Last Bulk Sync</div>
          <div className="text-lg font-medium text-gray-800">
            {lastSync?.ended_at 
              ? new Date(lastSync.ended_at).toLocaleString()
              : 'Never'}
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-green-50">
          <div className="text-sm text-green-700">Last Sync Result</div>
          <div className="text-lg font-medium text-green-800">
            {lastSync 
              ? `${lastSync.orders_updated || 0} updated`
              : '—'}
          </div>
        </div>
      </div>

      {/* Sync Controls */}
      <BulkSyncClient orderCount={count || 0} />

      {/* Orders Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h2 className="font-medium">M&P Orders ({orders?.length || 0})</h2>
        </div>
        {(!orders || orders.length === 0) ? (
          <div className="p-8 text-center text-gray-500">
            No M&P orders with tracking numbers found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">CN</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${o.id}`} className="text-blue-600 hover:underline">
                        #{o.short_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{o.customer_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{o.courier_tracking_number}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
