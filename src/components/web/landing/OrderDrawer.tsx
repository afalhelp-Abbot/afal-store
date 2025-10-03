'use client';

import React from 'react';
import { getUTM } from '@/lib/utm';

type Matrix = Record<string, { price: number; availability: number; variantId: string }>;

type OrderDrawerProps = {
  open: boolean;
  onClose: () => void;
  colors: string[];
  models: string[];
  packages: string[];
  sizes: string[];
  matrix: Matrix;
  initialColor?: string | null;
};

export default function OrderDrawer({ open, onClose, colors, models, packages, sizes, matrix, initialColor }: OrderDrawerProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ order_id: string } | null>(null);

  const [color, setColor] = React.useState<string>(initialColor || colors[0] || '');
  const [model, setModel] = React.useState<string>(models[0] || '');

  React.useEffect(() => {
    if (!color && colors.length) setColor(colors[0]);
  }, [colors, color]);
  React.useEffect(() => {
    if (!model && models.length) setModel(models[0]);
  }, [models, model]);

  // quantities keyed by matrix key
  const [qtyMap, setQtyMap] = React.useState<Record<string, number>>({});
  const setQty = (k: string, qty: number) => setQtyMap((m) => ({ ...m, [k]: Math.max(0, Math.floor(qty || 0)) }));

  const sizesOrEmpty = sizes.length ? sizes : [''];
  const packsOrEmpty = packages.length ? packages : [''];
  const useModel = models.length ? model : '';

  const formRef = React.useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const fd = new FormData(formRef.current!);
      const items = Object.entries(qtyMap)
        .filter(([, q]) => (q || 0) > 0)
        .map(([k, q]) => ({ variant_id: matrix[k]?.variantId, qty: q }))
        .filter((it) => !!it.variant_id);
      if (items.length === 0) throw new Error('Please enter quantity for at least one option');
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
        items,
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
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-xl p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Select variations and quantity</h2>
          <button onClick={() => !loading && onClose()} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="border rounded p-4 bg-green-50 text-green-800">
              Order placed successfully! Your order id is <span className="font-semibold">#{success.order_id}</span>.
            </div>
            <button onClick={onClose} className="bg-black text-white rounded px-4 py-2">Close</button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            {/* Choose Color */}
            {colors.length > 0 && (
              <div>
                <div className="text-sm text-gray-600 mb-2">Color</div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button key={c} type="button" onClick={()=>setColor(c)} className={`px-3 py-1.5 rounded-full border text-sm ${c===color?'bg-black text-white':'bg-white hover:bg-gray-50'}`}>{c}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Choose Model if any */}
            {models.length > 1 && (
              <div>
                <div className="text-sm text-gray-600 mb-2">Model</div>
                <select value={model} onChange={(e)=>setModel(e.target.value)} className="border rounded px-3 py-2">
                  {models.map((m)=> (<option key={m} value={m}>{m}</option>))}
                </select>
              </div>
            )}

            {/* Grid: Size x Package */}
            <div>
              <div className="text-sm text-gray-600 mb-2">Choose quantities</div>
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[520px] border">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-2 text-left">Size</th>
                      {packsOrEmpty.map((p) => (
                        <th key={p || 'empty'} className="p-2 text-left">{p || '—'}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sizesOrEmpty.map((s) => (
                      <tr key={s || 'empty'} className="border-t">
                        <td className="p-2 font-medium">{s || '—'}</td>
                        {packsOrEmpty.map((p) => {
                          const key = `${color || ''}|${useModel}|${p || ''}|${s || ''}`;
                          const cell = matrix[key];
                          const avail = cell?.availability ?? 0;
                          const price = cell?.price;
                          const disabled = !cell || avail <= 0;
                          const v = qtyMap[key] ?? 0;
                          return (
                            <td key={(p||'empty')+'-'+(s||'empty')} className="p-2">
                              {disabled ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, avail)}
                                    value={v}
                                    onChange={(e)=>setQty(key, Number(e.target.value))}
                                    className="border rounded px-2 py-1 w-20"
                                  />
                                  <div className="text-xs text-gray-600">{avail} avail · PKR {Number(price).toLocaleString()}</div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Customer info */}
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
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className={`rounded px-4 py-2 text-white ${loading ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
              >
                {loading ? 'Placing Order...' : 'Start Order'}
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
