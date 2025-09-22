'use client';

import React from 'react';
import OrderDrawer from './OrderDrawer';

type BuyPanelProps = {
  startingPrice: number | null;
  colorPrices: Record<string, number>;
  colorAvailability: Record<string, number>;
  colorVariantId: Record<string, string>;
};

export default function BuyPanel({ startingPrice, colorPrices, colorAvailability, colorVariantId }: BuyPanelProps) {
  const colors = React.useMemo(() => Object.keys(colorPrices).sort(), [colorPrices]);
  const [selectedColor, setSelectedColor] = React.useState<string>(colors[0] || '');
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!selectedColor && colors.length) setSelectedColor(colors[0]);
  }, [colors, selectedColor]);

  const price = selectedColor ? colorPrices[selectedColor] ?? startingPrice : startingPrice;
  const avail = selectedColor ? colorAvailability[selectedColor] : undefined;
  const variantId = selectedColor ? colorVariantId[selectedColor] ?? null : null;
  const lowStock = typeof avail === 'number' && avail > 0 && avail <= 5;

  return (
    <div className="border rounded p-4 space-y-4 shadow-sm">
      <div>
        <div className="text-sm text-gray-600">Price</div>
        <div className="text-2xl font-semibold">{price != null ? `PKR ${Number(price).toLocaleString()}` : '—'}</div>
      </div>

      <div>
        <div className="text-sm text-gray-600 mb-2">Color</div>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => {
            const active = selectedColor === c;
            const a = colorAvailability[c] ?? 0;
            const disabled = a <= 0;
            return (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                disabled={disabled}
                className={`px-3 py-2 rounded-full border text-sm flex items-center gap-2 ${active ? 'bg-black text-white' : 'bg-white'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                title={disabled ? 'Out of stock' : `${a} available`}
              >
                {active && (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                )}
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-sm text-gray-600 flex items-center gap-2">
        {avail == null ? '' : (
          avail > 0 ? (
            <>
              {lowStock && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Low stock</span>}
              <span>{avail} available</span>
            </>
          ) : (
            <span className="text-red-600">Out of stock</span>
          )
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          disabled={!variantId || (typeof avail === 'number' && avail <= 0)}
          className={`rounded px-4 py-2 text-white ${(!variantId || (typeof avail === 'number' && avail <= 0)) ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
        >
          Start Order
        </button>
        <button className="px-4 py-2 rounded border">Chat</button>
      </div>

      {/* Trust row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12H4"/><path d="M14 6l6 6-6 6"/></svg> Cash on Delivery</span>
        <span className="inline-flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21V7a2 2 0 0 0-2-2h-3l-2-2H8L6 5H5a2 2 0 0 0-2 2v14z"/></svg> 24–48h Dispatch</span>
        <span className="inline-flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z"/><path d="M9 12l2 2 4-4"/></svg> Easy Returns</span>
      </div>

      <OrderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variantId={variantId}
        color={selectedColor || null}
        price={price ?? null}
      />
    </div>
  );
}
