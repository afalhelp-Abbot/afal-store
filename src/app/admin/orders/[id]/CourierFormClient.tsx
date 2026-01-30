'use client';

import { useState, useTransition } from 'react';
import { updateCourierAction } from './courierActions';

type Props = {
  orderId: string;
  currentCourierId: string;
  currentTrackingNumber: string;
  currentNotes: string;
  couriers: { id: string; name: string }[];
};

export function CourierFormClient({
  orderId,
  currentCourierId,
  currentTrackingNumber,
  currentNotes,
  couriers,
}: Props) {
  const [courierId, setCourierId] = useState(currentCourierId);
  const [trackingNumber, setTrackingNumber] = useState(currentTrackingNumber);
  const [notes, setNotes] = useState(currentNotes);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set('orderId', orderId);
    formData.set('courierId', courierId);
    formData.set('trackingNumber', trackingNumber);
    formData.set('notes', notes);

    startTransition(async () => {
      const result = await updateCourierAction(formData);
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.message || 'Failed to update courier');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm mb-1">Courier</label>
        <select
          value={courierId}
          onChange={(e) => setCourierId(e.target.value)}
          className="border rounded px-3 py-2 w-full text-sm"
        >
          <option value="">— Select courier —</option>
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm mb-1">Tracking / CN</label>
        <input
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Optional"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="border rounded px-3 py-2 w-full text-sm"
          placeholder="Optional"
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
          Courier info saved!
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {isPending ? 'Saving...' : 'Save Courier'}
      </button>
    </form>
  );
}
