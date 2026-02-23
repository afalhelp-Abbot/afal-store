import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { MnpPaymentReportClient } from './MnpPaymentReportClient';

export default async function MnpPaymentsPage() {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // Fetch existing payment records
  const { data: payments } = await supabase
    .from('mnp_payment_records')
    .select('*')
    .order('paid_on', { ascending: false })
    .limit(100);

  // Fetch last sync info
  const { data: lastSync } = await supabase
    .from('courier_sync_logs')
    .select('*')
    .eq('sync_type', 'payment_report')
    .eq('courier_api_type', 'mnp')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Calculate totals
  const totalNetPayable = (payments || []).reduce((sum, p) => sum + Number(p.net_payable || 0), 0);
  const totalRRAmount = (payments || []).reduce((sum, p) => sum + Number(p.rr_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">M&P Payment Report</h1>
          <p className="text-gray-600 text-sm mt-1">
            COD settlements from M&P Courier
          </p>
        </div>
        <Link href="/admin/reports" className="text-sm underline">
          ← Back to Reports
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 bg-green-50">
          <div className="text-sm text-green-700">Total Net Payable</div>
          <div className="text-2xl font-bold text-green-800">
            {totalNetPayable.toLocaleString()} PKR
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-blue-50">
          <div className="text-sm text-blue-700">Total COD Collected</div>
          <div className="text-2xl font-bold text-blue-800">
            {totalRRAmount.toLocaleString()} PKR
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="text-sm text-gray-700">Last Synced</div>
          <div className="text-lg font-medium text-gray-800">
            {lastSync?.ended_at 
              ? new Date(lastSync.ended_at).toLocaleString()
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Sync Controls */}
      <MnpPaymentReportClient lastSyncAt={lastSync?.ended_at || null} />

      {/* Payment Records Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h2 className="font-medium">Payment Records ({payments?.length || 0})</h2>
        </div>
        {(!payments || payments.length === 0) ? (
          <div className="p-8 text-center text-gray-500">
            No payment records yet. Click "Sync Payment Report" to fetch data from M&P.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3">Payment ID</th>
                  <th className="text-left px-4 py-3">Paid On</th>
                  <th className="text-right px-4 py-3">COD Amount</th>
                  <th className="text-right px-4 py-3">Fees</th>
                  <th className="text-right px-4 py-3">Net Payable</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{p.payment_id}</td>
                    <td className="px-4 py-3">
                      {new Date(p.paid_on).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {Number(p.rr_amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {Number(p.invoice_amount) > 0 ? `-${Number(p.invoice_amount).toLocaleString()}` : '0'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">
                      {Number(p.net_payable).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                        {p.instrument_mode || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {p.instrument_number || '—'}
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
