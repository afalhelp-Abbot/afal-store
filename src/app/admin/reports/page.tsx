import { requireAdmin } from '@/lib/auth';
import Link from 'next/link';

export default async function ReportsPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* M&P Payment Report */}
        <Link
          href="/admin/reports/mnp-payments"
          className="border rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-xl">
              💰
            </div>
            <h2 className="font-semibold text-lg group-hover:text-blue-600">M&P Payment Report</h2>
          </div>
          <p className="text-gray-600 text-sm">
            View COD settlements from M&P Courier. Track payments received and pending amounts.
          </p>
        </Link>

        {/* Bulk Status Sync */}
        <Link
          href="/admin/reports/bulk-sync"
          className="border rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600 text-xl">
              🔄
            </div>
            <h2 className="font-semibold text-lg group-hover:text-green-600">Bulk Status Sync</h2>
          </div>
          <p className="text-gray-600 text-sm">
            Sync tracking status for all M&P orders at once. Updates order statuses automatically.
          </p>
        </Link>

        {/* Sync Logs */}
        <Link
          href="/admin/reports/sync-logs"
          className="border rounded-lg p-6 hover:border-gray-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 text-xl">
              📋
            </div>
            <h2 className="font-semibold text-lg group-hover:text-gray-600">Sync Logs</h2>
          </div>
          <p className="text-gray-600 text-sm">
            View history of all sync operations. Monitor API calls and errors.
          </p>
        </Link>
      </div>
    </div>
  );
}
