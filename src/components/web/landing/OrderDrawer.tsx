'use client';

import React from 'react';
import { getUTM } from '@/lib/utm';

type OrderDrawerProps = {
  open: boolean;
  onClose: () => void;
  variantId: string | null;
  color: string | null;
  price: number | null;
};

export default function OrderDrawer({ open, onClose, variantId, color, price }: OrderDrawerProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ order_id: string } | null>(null);

  const formRef = React.useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantId) {
      setError('Please select a color/variant');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData(formRef.current!);
      const payload = {
        customer: {
          name: String(fd.get('name') || '').trim(),
          email: String(fd.get('email') || '').trim() || undefined,
          phone: String(fd.get('phone') || '').trim(),
          address: String(fd.get('address') || '').trim(),
          city: String(fd.get('city') || '').trim(),
          province_code: String(fd.get('province_code') || '').trim() || undefined,
        },
        utm: {
          source: getUTM().utm_source,
          medium: getUTM().utm_medium,
          campaign: getUTM().utm_campaign,
        },
        items: [
          { variant_id: variantId, qty: Number(fd.get('qty') || 1) || 1 },
        ],
      };
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create order');
      setSuccess({ order_id: data.order_id });
    } catch (err: any) {
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={() => !loading && onClose()} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Complete Your Order</h2>
          <button onClick={() => !loading && onClose()} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {/* Summary */}
        <div className="border rounded p-3 text-sm mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-600">Selected Color</div>
              <div className="font-medium">{color ?? '-'}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-600">Price</div>
              <div className="font-medium">{price != null ? `PKR ${Number(price).toLocaleString()}` : '—'}</div>
            </div>
          </div>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="border rounded p-4 bg-green-50 text-green-800">
              Order placed successfully! Your order id is <span className="font-semibold">#{success.order_id}</span>.
            </div>
            <button onClick={onClose} className="bg-black text-white rounded px-4 py-2">Close</button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm">Name</label>
                <input name="name" required className="border rounded px-3 py-2 w-full" />
              </div>
              <div>
                <label className="block text-sm">Phone</label>
                <input name="phone" required className="border rounded px-3 py-2 w-full" />
              </div>
              <div>
                <label className="block text-sm">Email (optional)</label>
                <input name="email" type="email" className="border rounded px-3 py-2 w-full" />
              </div>
              <div>
                <label className="block text-sm">City</label>
                <input name="city" required className="border rounded px-3 py-2 w-full" />
              </div>
              <div>
                <label className="block text-sm">Province</label>
                <input name="province_code" className="border rounded px-3 py-2 w-full" />
              </div>
              <div>
                <label className="block text-sm">Address</label>
                <input name="address" required className="border rounded px-3 py-2 w-full" />
              </div>
              <div>
                <label className="block text-sm">Quantity</label>
                <input name="qty" type="number" min={1} defaultValue={1} className="border rounded px-3 py-2 w-24" />
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className={`rounded px-4 py-2 text-white ${loading ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
              >
                {loading ? 'Placing Order...' : 'Place Order'}
              </button>
              <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded border">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
