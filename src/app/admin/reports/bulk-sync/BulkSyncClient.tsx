'use client';

import { useState, useTransition } from 'react';
import { bulkSyncMnpStatusAction } from './actions';

type Props = {
  orderCount: number;
};

export function BulkSyncClient({ orderCount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSync() {
    if (orderCount === 0) {
      setError('No orders to sync');
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await bulkSyncMnpStatusAction();
      if (result.ok) {
        setSuccess(`Synced ${result.totalProcessed} orders. ${result.updated} updated, ${result.errors} errors.`);
      } else {
        setError(result.message || 'Sync failed');
      }
    });
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="font-medium mb-3">Run Bulk Sync</h3>
      
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending || orderCount === 0}
          className="bg-green-600 hover:bg-green-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {isPending ? 'Syncing...' : `🔄 Sync ${orderCount} Orders`}
        </button>
        
        <p className="text-sm text-gray-500">
          This will call M&P tracking API for each order. Max 200 per run.
        </p>
      </div>

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
