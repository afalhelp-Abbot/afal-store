'use client';

import { useState, useTransition } from 'react';
import { bookWithLeopardsAction } from './leopardsActions';

type Props = {
  orderId: string;
  courierApiType: string | null;
  hasTrackingNumber: boolean;
  trackingNumber: string | null;
  bookedAt: string | null;
};

export function LeopardsBookingClient({
  orderId,
  courierApiType,
  hasTrackingNumber,
  trackingNumber,
  bookedAt,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only show for Leopards courier
  if (courierApiType !== 'leopards') {
    return null;
  }

  // Already booked
  if (hasTrackingNumber && trackingNumber) {
    return (
      <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
        <div className="font-medium text-green-800">Booked with Leopards</div>
        <div className="text-green-700">CN: {trackingNumber}</div>
        {bookedAt && (
          <div className="text-green-600 text-xs mt-1">
            Booked: {new Date(bookedAt).toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  async function handleBook() {
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('orderId', orderId);

    startTransition(async () => {
      const result = await bookWithLeopardsAction(formData);
      if (result.ok) {
        setSuccess(`Booked successfully! CN: ${result.trackingNumber}`);
      } else {
        setError(result.message || 'Booking failed');
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleBook}
        disabled={isPending}
        className="bg-orange-600 hover:bg-orange-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50 w-full"
      >
        {isPending ? 'Booking...' : '📦 Book with Leopards'}
      </button>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
          {success}
        </div>
      )}
    </div>
  );
}
