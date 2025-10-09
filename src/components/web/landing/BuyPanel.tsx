'use client';

import React from 'react';
import OrderDrawer from './OrderDrawer';

type BuyPanelProps = {
  colors: string[];
  models: string[];
  packages: string[];
  sizes: string[];
  // key is `${color}|${model}|${pack}` with empty string for missing dimension
  matrix: Record<string, { price: number; availability: number; variantId: string } >;
  // optional color -> thumbnail url mapping
  colorThumbs?: Record<string, string | undefined>;
};

export default function BuyPanel({ colors, models, packages, sizes, matrix, colorThumbs }: BuyPanelProps) {
  const [selectedColor, setSelectedColor] = React.useState<string>(colors[0] || '');
  const [selectedModel, setSelectedModel] = React.useState<string>(models[0] || '');
  const [selectedPackage, setSelectedPackage] = React.useState<string>(packages[0] || '');
  const [selectedSize, setSelectedSize] = React.useState<string>(sizes[0] || '');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [showFloatCTA, setShowFloatCTA] = React.useState(false);
  const [nearBottom, setNearBottom] = React.useState(false);

  React.useEffect(() => {
    if (!selectedColor && colors.length) setSelectedColor(colors[0]);
  }, [colors, selectedColor]);
  React.useEffect(() => {
    if (!selectedModel && models.length) setSelectedModel(models[0]);
  }, [models, selectedModel]);
  React.useEffect(() => {
    if (!selectedPackage && packages.length) setSelectedPackage(packages[0]);
  }, [packages, selectedPackage]);
  React.useEffect(() => {
    if (!selectedSize && sizes.length) setSelectedSize(sizes[0]);
  }, [sizes, selectedSize]);

  const key = `${selectedColor || ''}|${models.length ? selectedModel : ''}|${packages.length ? selectedPackage : ''}|${sizes.length ? selectedSize : ''}`;
  const entry = matrix[key];
  const price = entry?.price ?? null;
  const avail = entry?.availability;
  const variantId = entry?.variantId ?? null;
  const lowStock = typeof avail === 'number' && avail > 0 && avail <= 5;

  // Determine if any combinations under current selection are available (for enabling the drawer)
  const anyAvailForSelection = React.useMemo(() => {
    const m = matrix;
    // constrain by selected color; optional by model/package/size depending on list lengths
    const selectedModelKey = models.length ? selectedModel : '';
    const selectedPackageKey = packages.length ? selectedPackage : '';
    const selectedSizeKey = sizes.length ? selectedSize : '';
    // If any dimension has more than 1 option, allow drawer even if current single key is out of stock
    let total = 0;
    for (const [k, v] of Object.entries(m)) {
      const [c, mKey, pKey, sKey] = k.split('|');
      if ((c || '') !== (selectedColor || '')) continue;
      if (models.length && mKey !== selectedModelKey) continue;
      if (packages.length && pKey !== selectedPackageKey) continue;
      if (sizes.length && sKey !== selectedSizeKey) continue;
      total += v?.availability ?? 0;
    }
    return total > 0;
  }, [matrix, selectedColor, selectedModel, selectedPackage, selectedSize, models.length, packages.length, sizes.length]);

  // Re-appearing CTA: if the panel scrolls out of view, show a floating Start Order button
  React.useEffect(() => {
    if (!panelRef.current) return;
    const el = panelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setShowFloatCTA(!entry.isIntersecting);
      },
      { root: null, rootMargin: '0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [panelRef.current]);

  // Observe bottom sentinel to avoid overlaying footer
  React.useEffect(() => {
    const sentinel = typeof document !== 'undefined' ? document.getElementById('lp-bottom-sentinel') : null;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => setNearBottom(entries[0]?.isIntersecting || false),
      { root: null, rootMargin: '0px', threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  // No fade/delay per user request

  return (
    <div ref={panelRef} className="border rounded p-4 space-y-4 shadow-sm">
      <div>
        <div className="text-sm text-gray-600">Price</div>
        <div className="text-2xl font-semibold">{price != null ? `PKR ${Number(price).toLocaleString()}` : '—'}</div>
      </div>

      <div>
        <div className="text-sm text-gray-600 mb-2">Color</div>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => {
            const active = selectedColor === c;
            // compute availability across model/package for this color (sum of valid combos)
            const a = Object.entries(matrix)
              .filter(([k]) => k.startsWith(`${c}|`))
              .reduce((acc, [, v]) => acc + (v?.availability ?? 0), 0);
            const disabled = a <= 0;
            const thumb = colorThumbs?.[c];
            return (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                disabled={disabled}
                className={`rounded-full border text-sm flex items-center justify-center ${active ? 'ring-2 ring-black' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                style={{ width: 40, height: 40, padding: 0, overflow: 'hidden', background: 'white' }}
                title={disabled ? 'Out of stock' : `${a} available`}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={c} width={40} height={40} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                ) : (
                  <span className={`px-3 py-2 ${active ? 'bg-black text-white' : 'bg-white'}`}>{c}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model selector: chips when <=3, dropdown otherwise. Hidden if <=1 option. */}
      {models.length > 1 && (
        <div>
          <div className="text-sm text-gray-600 mb-2">Model</div>
          {models.length <= 3 ? (
            <div className="flex flex-wrap gap-2">
              {models.map((m) => {
                const active = selectedModel === m;
                // compute availability for this model in current color/package/size context
                const k = `${selectedColor || ''}|${m}|${packages.length ? selectedPackage : ''}|${sizes.length ? selectedSize : ''}`;
                const a = matrix[k]?.availability ?? 0;
                const disabled = a <= 0;
                return (
                  <button
                    key={m}
                    onClick={() => setSelectedModel(m)}
                    disabled={disabled}
                    className={`px-3 py-2 rounded-full border text-sm ${active ? 'bg-black text-white' : 'bg-white'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    title={disabled ? 'Out of stock' : `${a} available`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          ) : (
            <select value={selectedModel} onChange={(e)=>setSelectedModel(e.target.value)} className="border rounded px-3 py-2">
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Package selector: hidden if <=1 option. */}
      {packages.length > 1 && (
        <div>
          <div className="text-sm text-gray-600 mb-2">Package</div>
          <div className="flex flex-wrap gap-2">
            {packages.map((p) => {
              const active = selectedPackage === p;
              const k = `${selectedColor || ''}|${models.length ? selectedModel : ''}|${p}|${sizes.length ? selectedSize : ''}`;
              const a = matrix[k]?.availability ?? 0;
              const disabled = a <= 0;
              return (
                <button
                  key={p}
                  onClick={() => setSelectedPackage(p)}
                  disabled={disabled}
                  className={`px-3 py-2 rounded-full border text-sm ${active ? 'bg-black text-white' : 'bg-white'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                  title={disabled ? 'Out of stock' : `${a} available`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Size selector: hidden if <=1 option. */}
      {sizes.length > 1 && (
        <div>
          <div className="text-sm text-gray-600 mb-2">Size</div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const active = selectedSize === s;
              const k = `${selectedColor || ''}|${models.length ? selectedModel : ''}|${packages.length ? selectedPackage : ''}|${s}`;
              const a = matrix[k]?.availability ?? 0;
              const disabled = a <= 0;
              return (
                <button
                  key={s}
                  onClick={() => setSelectedSize(s)}
                  disabled={disabled}
                  className={`px-3 py-2 rounded-full border text-sm ${active ? 'bg-black text-white' : 'bg-white'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                  title={disabled ? 'Out of stock' : `${a} available`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          disabled={!anyAvailForSelection}
          className={`rounded px-4 py-2 text-white ${(!anyAvailForSelection) ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
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
        colors={colors}
        models={models}
        packages={packages}
        sizes={sizes}
        matrix={matrix}
        initialColor={selectedColor || null}
        colorThumbs={colorThumbs}
      />

      {/* Floating buy panel that follows scrolling; grows near bottom */}
      {(showFloatCTA || nearBottom) && !drawerOpen && (
        <div className={`fixed right-4 z-40 max-w-[95vw] ${nearBottom ? 'bottom-6 w-[483px]' : 'bottom-4 w-[345px]'}`}>
          <div className="border rounded-lg bg-white shadow-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Price</div>
              <div className={`${nearBottom ? 'text-2xl' : 'text-xl'} font-semibold`}>{price != null ? `PKR ${Number(price).toLocaleString()}` : '—'}</div>
            </div>
            {/* Keep quick selectors for Color and Size if multiple options */}
            {colors.length > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">Color</span>
                {/* Scrollable swatches with scroll-snap and edge fades */}
                <div className="relative flex-1">
                  <div className="flex gap-2 overflow-x-auto pr-1 snap-x snap-mandatory">
                    {colors.map((c) => {
                      const totalAvailForColor = Object.entries(matrix)
                        .filter(([k]) => k.startsWith(`${c}|`))
                        .reduce((acc, [, v]) => acc + (v?.availability ?? 0), 0);
                      const disabled = totalAvailForColor <= 0;
                      const thumb = colorThumbs?.[c];
                      const active = selectedColor === c;
                      return (
                      <button
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        disabled={disabled}
                        className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'} ${active ? 'ring-2 ring-black' : ''} rounded-full border snap-start`}
                        style={{ width: 32, height: 32, padding: 0, overflow: 'hidden', background: 'white' }}
                        title={disabled ? 'Out of stock' : `${totalAvailForColor} available`}
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt={c} width={32} height={32} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                        ) : (
                          <span className={`px-2 ${active ? 'bg-black text-white' : 'bg-white'}`}>{c}</span>
                        )}
                      </button>
                    );
                  })}
                  </div>
                  {/* Edge fades */}
                  <div className="pointer-events-none absolute left-0 top-0 h-full w-6 bg-gradient-to-r from-white to-transparent shadow-md" />
                  <div className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-white to-transparent shadow-md" />
                </div>
              </div>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              disabled={!anyAvailForSelection}
              className={`w-full rounded ${nearBottom ? 'px-6 py-3.5' : 'px-5 py-2.5'} text-white ${(!anyAvailForSelection) ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
            >
              Start Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
