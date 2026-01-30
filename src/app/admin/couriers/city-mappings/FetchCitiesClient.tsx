'use client';

import { useState, useTransition } from 'react';
import { fetchLeopardsCitiesAction } from './actions';

type Props = {
  courierId: string;
};

export function FetchCitiesClient({ courierId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFetch() {
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('courierId', courierId);

    startTransition(async () => {
      const result = await fetchLeopardsCitiesAction(formData);
      if (result.ok) {
        setSuccess(`Fetched ${result.count} cities from Leopards!`);
        // Reload page to show new cities
        window.location.reload();
      } else {
        setError(result.message || 'Failed to fetch cities');
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleFetch}
        disabled={isPending}
        className="bg-orange-600 hover:bg-orange-700 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {isPending ? 'Fetching...' : '🔄 Fetch Leopards Cities'}
      </button>

      {error && (
        <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-600 text-xs bg-green-50 border border-green-200 rounded px-2 py-1">
          {success}
        </div>
      )}
    </div>
  );
}
