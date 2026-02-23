'use client';

import { useState, useTransition } from 'react';
import { bookWithMnpAction, syncMnpStatusAction } from './mnpActions';

type Props = {
  orderId: string;
  courierApiType: string | null;
  hasTrackingNumber: boolean;
  trackingNumber: string | null;
  bookedAt: string | null;
};

type TrackingHistoryItem = {
  status: string;
  time: string;
  narration: string;
};

export function MnpBookingClient({
  orderId,
  courierApiType,
  hasTrackingNumber,
  trackingNumber,
  bookedAt,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [trackingHistory, setTrackingHistory] = useState<TrackingHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Only show for M&P courier
  if (courierApiType !== 'mnp') {
    return null;
  }

  async function handleBook() {
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('orderId', orderId);

    startTransition(async () => {
      const result = await bookWithMnpAction(formData);
      if (result.ok) {
        setSuccess(`Booked successfully! CN: ${result.trackingNumber}`);
      } else {
        setError(result.message || 'Booking failed');
      }
    });
  }

  async function handleSyncStatus() {
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.set('orderId', orderId);

    startTransition(async () => {
      const result = await syncMnpStatusAction(formData);
      if (result.ok) {
        if (result.statusChanged) {
          setSuccess(`Status updated: ${result.mnpStatus} → ${result.newStatus}`);
        } else {
          setSuccess(`M&P Status: ${result.mnpStatus} (no change needed)`);
        }
        if (result.trackingHistory) {
          setTrackingHistory(result.trackingHistory as TrackingHistoryItem[]);
          setShowHistory(true);
        }
      } else {
        setError(result.message || 'Sync failed');
      }
    });
  }

  // Already booked - show sync button
  if (hasTrackingNumber && trackingNumber) {
    return (
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
          <div className="font-medium text-blue-800">Booked with M&P</div>
          <div className="text-blue-700">CN: {trackingNumber}</div>
          {bookedAt && (
            <div className="text-blue-600 text-xs mt-1">
              Booked: {new Date(bookedAt).toLocaleString()}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSyncStatus}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50 w-full"
        >
          {isPending ? 'Syncing...' : '🔄 Sync Status from M&P'}
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

        {showHistory && trackingHistory.length > 0 && (
          <div className="border rounded p-2 text-xs space-y-1 max-h-48 overflow-y-auto">
            <div className="font-medium text-gray-700 mb-2">Tracking History:</div>
            {trackingHistory.map((item, i) => (
              <div key={i} className="border-b pb-1 last:border-0">
                <div className="font-medium">{item.status}</div>
                <div className="text-gray-500">{item.time}</div>
                <div className="text-gray-600">{item.narration}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Not booked yet - show book button
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleBook}
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm disabled:opacity-50 w-full"
      >
        {isPending ? 'Booking...' : '📦 Book with M&P'}
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
