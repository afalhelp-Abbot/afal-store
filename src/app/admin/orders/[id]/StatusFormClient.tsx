'use client';

import { useState, useTransition } from 'react';
import { updateStatusAction } from './actions';

type Props = {
  id: string;
  currentStatus: string;
  items: any[];
};

export function StatusFormClient({ id, currentStatus, items }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateStatusAction(formData);
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.message || 'Failed to update status');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className="block text-sm">Status</label>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-3 py-2 w-full"
        >
          <option value="pending">Pending</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="return_in_transit">Return in transit</option>
          <option value="cancelled">Cancelled</option>
          <option value="returned">Returned</option>
        </select>
      </div>
      <div className="space-y-2 text-sm border-t pt-3">
        <div className="font-medium">Return condition (used when marking as Returned)</div>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {items.map((it: any) => (
            <div key={it.id} className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <div className="font-mono text-xs">{it.variants?.sku || it.variant_id}</div>
                <div className="text-gray-600 text-xs">Qty: {it.qty}</div>
              </div>
              <select
                name={`item[${it.id}][return_condition]`}
                defaultValue={it.return_condition || ''}
                className="border rounded px-2 py-1 text-xs"
              >
                <option value="">--</option>
                <option value="resellable">Resellable</option>
                <option value="not_resellable">Not resellable</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
          Status updated successfully!
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
