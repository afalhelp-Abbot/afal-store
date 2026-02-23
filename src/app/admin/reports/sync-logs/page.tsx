import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';

export default async function SyncLogsPage() {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // Fetch sync logs
  const { data: logs } = await supabase
    .from('courier_sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sync Logs</h1>
          <p className="text-gray-600 text-sm mt-1">
            History of all courier API sync operations
          </p>
        </div>
        <Link href="/admin/reports" className="text-sm underline">
          ← Back to Reports
        </Link>
      </div>

      {/* Logs Table */}
      <div className="border rounded-lg overflow-hidden">
        {(!logs || logs.length === 0) ? (
          <div className="p-8 text-center text-gray-500">
            No sync logs yet. Run a sync operation to see logs here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">Started</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Courier</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Orders</th>
                  <th className="text-right px-4 py-3">Updated</th>
                  <th className="text-right px-4 py-3">API Calls</th>
                  <th className="text-left px-4 py-3">Duration</th>
                  <th className="text-left px-4 py-3">Triggered By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const duration = log.ended_at && log.started_at
                    ? Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                    : null;
                  
                  const statusColors: Record<string, string> = {
                    running: 'bg-yellow-100 text-yellow-800',
                    completed: 'bg-green-100 text-green-800',
                    completed_with_errors: 'bg-orange-100 text-orange-800',
                    failed: 'bg-red-100 text-red-800',
                    rate_limited: 'bg-purple-100 text-purple-800',
                  };

                  return (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {new Date(log.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                          {log.sync_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">{log.courier_api_type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${statusColors[log.status] || 'bg-gray-100'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{log.total_orders || 0}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">
                        {log.orders_updated || 0}
                      </td>
                      <td className="px-4 py-3 text-right">{log.api_calls_made || 0}</td>
                      <td className="px-4 py-3">
                        {duration !== null ? `${duration}s` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{log.triggered_by || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
