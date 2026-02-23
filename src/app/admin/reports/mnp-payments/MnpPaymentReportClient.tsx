'use client';

import { useState, useTransition } from 'react';
import { syncMnpPaymentReportAction } from './actions';

type Props = {
  lastSyncAt: string | null;
};

export function MnpPaymentReportClient({ lastSyncAt }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  async function handleSync() {
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('dateFrom', dateFrom);
    formData.set('dateTo', dateTo);

    startTransition(async () => {
      const result = await syncMnpPaymentReportAction(formData);
      if (result.ok) {
        setSuccess(`Synced ${result.recordsAdded} new payment records`);
      } else {
        setError(result.message || 'Sync failed');
      }
    });
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="font-medium mb-3">Sync Payment Report</h3>
      
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {isPending ? 'Syncing...' : '🔄 Sync Payment Report'}
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Note: M&P API allows max 31 days per request.
      </p>

      {error && (
        <div className="mt-3 text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 text-green-600 text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
          {success}
        </div>
      )}
    </div>
  );
}
