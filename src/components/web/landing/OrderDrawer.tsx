'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/pixel';

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
  colorThumbs?: Record<string, string | undefined>;
  logoUrl?: string | null;
  specialMessage?: string | null;
  contentIdSource?: 'sku' | 'variant_id';
  variantSkuMap?: Record<string, string>;
  promotions?: Array<{ id: string; name: string; active: boolean; type: 'percent' | 'bxgy'; min_qty: number; discount_pct: number | null; free_qty: number | null; start_at?: string | null; end_at?: string | null }>;
};

export default function OrderDrawer({ open, onClose, colors, models, packages, sizes, matrix, initialColor, colorThumbs, logoUrl, specialMessage, contentIdSource, variantSkuMap, promotions }: OrderDrawerProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [color, setColor] = React.useState<string>(initialColor || colors[0] || '');
  const [model, setModel] = React.useState<string>(models[0] || '');

  // Pakistan provinces / territories
  const provinces = [
    { code: 'Sindh', name: 'Sindh' },
    { code: 'Punjab', name: 'Punjab' },
    { code: 'KPK', name: 'Khyber Pakhtunkhwa' },
    { code: 'Balochistan', name: 'Balochistan' },
    { code: 'ICT', name: 'Islamabad Capital Territory' },
    { code: 'AJK', name: 'Azad Jammu & Kashmir' },
    { code: 'GB', name: 'Gilgit-Baltistan' },
  ];

  // When the drawer opens, initialize the selected color from initialColor
  // or fall back to the first color, and reset quantities. Do NOT resync on
  // every color change, otherwise user clicks inside the drawer get overridden.
  React.useEffect(() => {
    if (!open) return;
    // reset quantities for a fresh session each time the drawer is opened
    setQtyMap({});
    if (initialColor) {
      setColor(initialColor);
    } else if (colors.length) {
      setColor(colors[0]);
    }
  }, [open, initialColor, colors]);
  React.useEffect(() => {
    if (!model && models.length) setModel(models[0]);
  }, [models, model]);

  // quantities keyed by matrix key
  const [qtyMap, setQtyMap] = React.useState<Record<string, number>>({});
  const setQty = (k: string, qty: number) =>
    setQtyMap((m) => ({ ...m, [k]: Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0)) }));

  const sizesOrEmpty = sizes.length ? sizes : [''];
  const packsOrEmpty = packages.length ? packages : [''];
  const useModel = models.length ? model : '';

  // Determine if we have only Color (no size/package dimensions)
  const onlyColor = sizes.length === 0 && packages.length === 0 && models.length === 0;
  const sizesOnly = sizes.length > 0 && packages.length === 0 && models.length === 0;

  const formRef = React.useRef<HTMLFormElement>(null);

  // Autofocus first quantity input when opening
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        const el = formRef.current?.querySelector('input[type="number"]') as HTMLInputElement | null;
        el?.focus(); el?.select();
      } catch {}
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const items = Object.entries(qtyMap)
        .filter(([, q]) => (q || 0) > 0)
        .map(([k, q]) => ({ variant_id: matrix[k]?.variantId, qty: q }))
        .filter((it) => !!it.variant_id);
      if (items.length === 0) throw new Error('Please enter quantity for at least one option');
      // Fire AddToCart with contents/value before navigating to checkout
      try {
        const priceByVariant = (vid: string): number => {
          for (const cell of Object.values(matrix)) { if (cell?.variantId === vid) return Number(cell?.price || 0); }
          return 0;
        };
        const contents = items.map((it) => ({
          id: (contentIdSource === 'variant_id') ? (it.variant_id as string) : ((variantSkuMap?.[it.variant_id as string]) || (it.variant_id as string)),
          quantity: Number(it.qty || 0),
          item_price: priceByVariant(it.variant_id as string),
        }));
        const value = contents.reduce((s, c) => s + Number(c.item_price || 0) * Number(c.quantity || 0), 0);
        const content_ids = contents.map(c => c.id).slice(0, 20);
        track('AddToCart', { contents, content_ids, value, currency: 'PKR', content_type: 'product' });
      } catch {}
      // Pass items to /checkout using query param (URL-encoded JSON)
      const itemsParam = encodeURIComponent(JSON.stringify(items));
      const fromPath = typeof window !== 'undefined' ? window.location.pathname : '/';
      const fromParam = encodeURIComponent(fromPath);
      router.push(`/checkout?items=${itemsParam}&from=${fromParam}`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Live subtotal (PKR) for quantities entered in this drawer
  const subtotal: number = React.useMemo(() => {
    let sum = 0;
    for (const [k, q] of Object.entries(qtyMap)) {
      const qty = Number(q || 0);
      if (qty <= 0) continue;
      const price = Number(matrix[k]?.price || 0);
      sum += qty * price;
    }
    return sum;
  }, [qtyMap, matrix]);

  // Total quantity across all selected options
  const totalQty: number = React.useMemo(() => {
    let q = 0;
    for (const v of Object.values(qtyMap)) {
      q += Number(v || 0);
    }
    return q;
  }, [qtyMap]);

  // Determine best applicable promotion (if any). We do not change the item
  // payload sent to checkout here; this only affects displayed subtotal and
  // CTA text so the user sees their discount.
  const { finalSubtotal, discount, promoLabel } = React.useMemo(() => {
    if (!promotions || promotions.length === 0) return { finalSubtotal: subtotal, discount: 0, promoLabel: null as string | null };
    if (!subtotal || subtotal <= 0 || totalQty <= 0) return { finalSubtotal: subtotal, discount: 0, promoLabel: null as string | null };
    const now = new Date();
    let best = { d: 0, label: null as string | null };
    for (const p of promotions) {
      if (!p || !p.active) continue;
      if (p.min_qty && totalQty < p.min_qty) continue;
      if (p.start_at) {
        const s = new Date(p.start_at);
        if (now < s) continue;
      }
      if (p.end_at) {
        const e = new Date(p.end_at);
        if (now > e) continue;
      }
      let d = 0;
      if (p.type === 'percent' && p.discount_pct && p.discount_pct > 0) {
        d = subtotal * (p.discount_pct / 100);
      } else if (p.type === 'bxgy' && p.free_qty && p.free_qty > 0 && p.min_qty > 0) {
        const unitPrice = subtotal / totalQty;
        const freeUnits = Math.floor(totalQty / p.min_qty) * p.free_qty;
        d = freeUnits * unitPrice;
      }
      if (d > best.d) {
        best = { d, label: p.name || null };
      }
    }
    const fs = Math.max(0, subtotal - best.d);
    return { finalSubtotal: fs, discount: best.d, promoLabel: best.label };
  }, [promotions, subtotal, totalQty]);

  // Build simple order summary lines from qtyMap
  const orderLines = React.useMemo(
    () => {
      const lines: Array<{ key: string; label: string; qty: number; total: number }> = [];
      for (const [k, q] of Object.entries(qtyMap)) {
        const qty = Number(q || 0);
        if (qty <= 0) continue;
        const cell = matrix[k];
        if (!cell) continue;
        const [c, mKey, pKey, sKey] = k.split('|');
        const parts = [c, mKey, pKey, sKey].filter(Boolean);
        const label = parts.join(' · ') || 'Item';
        const price = Number(cell.price || 0);
        lines.push({ key: k, label, qty, total: qty * price });
      }
      return lines;
    },
    [qtyMap, matrix]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={() => !loading && onClose()} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-xl p-6 overflow-y-auto rounded-l-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl as string} alt="Logo" className="h-6 w-auto object-contain rounded border bg-white p-0.5" />
            )}
            <h2 className="text-lg font-semibold">Select variations and quantity</h2>
          </div>
          <button onClick={() => !loading && onClose()} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="text-xs text-gray-500 mb-2">Cash on Delivery · 24–48h Dispatch · Easy Returns</div>
        {specialMessage && (
          <div className="text-sm px-2.5 py-1.5 rounded border bg-emerald-50 text-emerald-800 mb-3">
            {specialMessage}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
            {/* Choose Color */}
            {colors.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Step 1 · Choose color</div>
                <div className="text-sm text-gray-600 mb-2">Color</div>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => {
                    const totalAvailForColor = Object.entries(matrix)
                      .filter(([k]) => k.startsWith(`${c}|`))
                      .reduce((acc, [, v]) => acc + (v?.availability ?? 0), 0);
                    const disabled = totalAvailForColor <= 0;
                    const thumb = colorThumbs?.[c];
                    const active = c === color;
                    const qtyForColor = Object.entries(qtyMap).reduce((sum, [k, q]) => {
                      const [colorKey] = k.split('|');
                      if ((colorKey || '') === (c || '')) {
                        return sum + Number(q || 0);
                      }
                      return sum;
                    }, 0);
                    const hasQty = qtyForColor > 0;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        disabled={disabled}
                        className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'} ${active ? 'ring-2 ring-black' : ''} rounded-full border`}
                        style={{ width: 40, height: 40, padding: 0, overflow: 'hidden', background: 'white', position: 'relative' }}
                        title={disabled ? 'Out of stock' : `${totalAvailForColor} available`}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={c} width={40} height={40} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                        ) : (
                          <span className={`px-3 py-2 ${active ? 'bg-black text-white' : 'bg-white'}`}>{c}</span>
                        )}
                        {hasQty && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">
                            {qtyForColor}
                          </span>
                        )}
                      </button>
                    );
                  })}
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

            {/* Quantity UI */}
            {onlyColor ? (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Step 2 · Quantity</div>
                <div className="text-sm text-gray-600 mb-2">Quantity</div>
                {(() => {
                  const key = `${color || ''}|${useModel}|${''}|${''}`;
                  const cell = matrix[key];
                  const avail = cell?.availability ?? 0;
                  const price = cell?.price;
                  const disabled = !cell || avail <= 0;
                  const v = qtyMap[key] ?? 0;
                  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  };
                  const dec = () => {
                    if (disabled) return;
                    setQty(key, Math.max(0, v - 1));
                  };
                  const inc = () => {
                    if (disabled) return;
                    setQty(key, Math.min(Math.max(0, avail), v + 1));
                  };
                  return (
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-stretch border rounded overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={dec}
                          disabled={disabled || v <= 0}
                          className="px-2 text-sm text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(0, avail)}
                          placeholder="0"
                          value={v === 0 ? '' : v}
                          onFocus={(e)=> e.currentTarget.select()}
                          onChange={(e)=>setQty(key, Number(e.target.value))}
                          onKeyDown={onKeyDown}
                          className="w-16 text-center border-l border-r border-gray-200 px-2 py-2 focus:outline-none"
                          disabled={disabled}
                        />
                        <button
                          type="button"
                          onClick={inc}
                          disabled={disabled || v >= avail}
                          className="px-2 text-sm text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-sm text-gray-600">{disabled ? 'Out of stock' : `${avail} available · PKR ${Number(price).toLocaleString()}`}</div>
                    </div>
                  );
                })()}
              </div>
            ) : sizesOnly ? (
              <div>
                <div className="text-sm text-gray-600 mb-2">Choose quantities</div>
                <div className="divide-y border rounded">
                  {sizes.map((s) => {
                    const key = `${color || ''}|${useModel}|${''}|${s || ''}`;
                    const cell = matrix[key];
                    const avail = cell?.availability ?? 0;
                    const price = cell?.price;
                    const disabled = !cell || avail <= 0;
                    const v = qtyMap[key] ?? 0;
                    const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => { if (e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); } };
                    return (
                      <div key={s || 'empty'} className="flex items-center justify-between p-2">
                        <div className="font-medium">{s || '—'}</div>
                        {disabled ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={Math.max(0, avail)}
                              placeholder="0"
                              value={v === 0 ? '' : v}
                              onFocus={(e)=> e.currentTarget.select()}
                              onChange={(e)=>setQty(key, Number(e.target.value))}
                              onKeyDown={onKeyDown}
                              className="border rounded px-2 py-1 w-20"
                            />
                            <div className="text-xs text-gray-600">{avail} avail · PKR {Number(price).toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
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
                            const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => { if (e.key === 'Enter') { e.preventDefault(); formRef.current?.requestSubmit(); } };
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
                                      placeholder="0"
                                      value={v === 0 ? '' : v}
                                      onFocus={(e)=> e.currentTarget.select()}
                                      onChange={(e)=>setQty(key, Number(e.target.value))}
                                      onKeyDown={onKeyDown}
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
            )}

            {/* Order summary */}
            {orderLines.length > 0 && (
              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Step 3 · Review order</div>
                <div className="font-medium text-gray-800">Order summary</div>
                <ul className="space-y-1">
                  {orderLines.map((ln) => (
                    <li key={ln.key} className="flex items-center justify-between">
                      <span className="text-gray-700">
                        {ln.label} 
                        <span className="text-gray-500">× {ln.qty}</span>
                      </span>
                      <span className="font-medium">PKR {Number(ln.total).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Subtotal */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-sm text-gray-600">Subtotal</div>
              <div className="text-right">
                {discount > 0 && (
                  <div className="text-xs text-green-700">Promo applied{promoLabel ? `: ${promoLabel}` : ''}</div>
                )}
                <div className="text-lg font-semibold">PKR {Number(finalSubtotal || 0).toLocaleString()}</div>
                {discount > 0 && (
                  <div className="text-xs text-gray-500 line-through">PKR {Number(subtotal || 0).toLocaleString()}</div>
                )}
              </div>
            </div>

            {/* No customer info here. Proceed to checkout to fill address & payment. */}
            <button
              type="submit"
              disabled={loading || finalSubtotal <= 0}
              className={`rounded px-4 py-2 text-white ${
                loading || finalSubtotal <= 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-black hover:bg-gray-900'
              }`}
            >
              {loading
                ? '...'
                : finalSubtotal > 0
                ? `Proceed to Checkout · PKR ${Number(finalSubtotal).toLocaleString()}`
                : 'Add at least 1 item to continue'}
            </button>
            <p className="text-[11px] text-gray-500 mt-1">
              You&apos;ll confirm your address on the next step. By continuing you agree to our
              {' '}
              <a href="/return-policy" target="_blank" rel="noopener" className="underline">Return Policy</a>.
            </p>
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded border">
              Cancel
            </button>
          </form>
      </div>
    </div>
  );
}
