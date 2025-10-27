'use client';

import React from 'react';
import OrderDrawer from './OrderDrawer';
import { track } from '@/lib/pixel';

type BuyPanelProps = {
  colors: string[];
  models: string[];
  packages: string[];
  sizes: string[];
  // key is `${color}|${model}|${pack}` with empty string for missing dimension
  matrix: Record<string, { price: number; availability: number; variantId: string } >;
  // optional color -> thumbnail url mapping
  colorThumbs?: Record<string, string | undefined>;
  // optional product logo to show in the panel header
  logoUrl?: string | null;
  // optional extras
  specialMessage?: string | null;
  darazUrl?: string | null;
  darazTrustLine?: boolean;
  chatFacebookUrl?: string | null;
  chatInstagramUrl?: string | null;
};

export default function BuyPanel({ colors, models, packages, sizes, matrix, colorThumbs, logoUrl, specialMessage, darazUrl, darazTrustLine, chatFacebookUrl, chatInstagramUrl }: BuyPanelProps) {
  const [selectedColor, setSelectedColor] = React.useState<string>(colors[0] || '');
  const [selectedModel, setSelectedModel] = React.useState<string>(models[0] || '');
  const [selectedPackage, setSelectedPackage] = React.useState<string>(packages[0] || '');
  const [selectedSize, setSelectedSize] = React.useState<string>(sizes[0] || '');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [showReturns, setShowReturns] = React.useState(false);
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

  const effectiveChatUrl = chatFacebookUrl || chatInstagramUrl || null;

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
      {logoUrl && (
        <div className="flex items-center mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Logo" className="h-6 w-auto object-contain rounded border bg-white p-0.5" />
        </div>
      )}
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

      {specialMessage && (
        <div className="text-sm px-2.5 py-1.5 sm:px-3 sm:py-2 rounded border bg-emerald-50 text-emerald-800">
          {specialMessage}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          disabled={!anyAvailForSelection}
          className={`w-full sm:w-auto rounded px-4 py-2 text-white ${(!anyAvailForSelection) ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
        >
          Start Order
        </button>
        {darazUrl && (
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                // Append UTM parameters safely
                let href = darazUrl as string;
                try {
                  const u = new URL(darazUrl as string);
                  u.searchParams.set('utm_source', 'afalstore');
                  u.searchParams.set('utm_medium', 'lp');
                  u.searchParams.set('utm_campaign', 'buy_on_daraz');
                  href = u.toString();
                } catch {}
                try { track('ClickDaraz', { url: href }); } catch {}
                window.open(href, '_blank', 'noopener');
              }
            }}
            className="w-full sm:w-auto px-3 sm:px-4 py-2 rounded bg-[#F57224] hover:bg-[#e86619] text-white inline-flex items-center justify-center gap-2 hover:ring-2 hover:ring-[#f9a66b]/50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="opacity-90"><path d="M6 2a1 1 0 0 0-1 1v2H3a1 1 0 1 0 0 2h1l1.6 10.4A3 3 0 0 0 8.57 20H17a1 1 0 1 0 0-2H8.57a1 1 0 0 1-.99-.84L7.4 16H18a3 3 0 0 0 2.95-2.52l.9-5.4A1 1 0 0 0 20.88 6H7V3a1 1 0 0 0-1-1z"/></svg>
            Buy on Daraz
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-90"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
          </button>
        )}
        {effectiveChatUrl && (
          <button
            onClick={() => { if (typeof window !== 'undefined' && effectiveChatUrl) { try { track('ClickChat', { url: effectiveChatUrl }); } catch {}; window.open(effectiveChatUrl, '_blank', 'noopener'); } }}
            className="w-full sm:w-auto px-4 py-2 rounded border"
          >
            Chat
          </button>
        )}
      </div>

      {/* Trust row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12H4"/><path d="M14 6l6 6-6 6"/></svg> Cash on Delivery</span>
        <span className="inline-flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21V7a2 2 0 0 0-2-2h-3l-2-2H8L6 5H5a2 2 0 0 0-2 2v14z"/></svg> 24–48h Dispatch</span>
        <button type="button" onClick={()=>{ setShowReturns(true); try { track('ClickReturnsInfo'); } catch {} }} className="inline-flex items-center gap-1 hover:underline">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l3 3"/></svg>
          Easy Returns
        </button>
        {darazTrustLine && darazUrl && (
          <a
            href={(() => { try { const u=new URL(darazUrl as string); u.searchParams.set('utm_source','afalstore'); u.searchParams.set('utm_medium','lp'); u.searchParams.set('utm_campaign','daraz_trust'); return u.toString(); } catch { return darazUrl as string; } })()}
            target="_blank"
            rel="noopener"
            onClick={()=>{ try { track('ClickDarazTrust'); } catch {} }}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12l2-2 4 4 8-8 2 2-10 10-6-6z"/></svg>
            Same seller on Daraz
          </a>
        )}
      </div>

      {showReturns && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setShowReturns(false)} />
          <div className="absolute inset-x-4 sm:inset-x-auto sm:right-6 top-[15%] sm:top-24 bg-white border rounded-lg shadow-xl max-w-lg mx-auto p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {logoUrl ? (<img src={logoUrl as string} alt="Logo" className="h-6 w-auto object-contain rounded border bg-white p-0.5" />) : null}
                <h3 className="text-base font-semibold">Return Policy</h3>
              </div>
              <button onClick={()=>setShowReturns(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="text-sm text-gray-700 space-y-3">
              <p>Returns are accepted only for product defects within <span className="font-medium">7 days of receiving</span>, with original packaging intact. Our support team will inspect and, once approved, refunds are issued within <span className="font-medium">14 days</span> via Easypaisa.</p>
              <p>See the full policy for details about eligibility and process.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <a href="/return-policy" target="_blank" rel="noopener" className="px-4 py-2 rounded border">Open full policy</a>
              <button onClick={()=>setShowReturns(false)} className="px-4 py-2 rounded bg-black text-white">Close</button>
            </div>
          </div>
        </div>
      )}

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
        logoUrl={logoUrl}
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
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                disabled={!anyAvailForSelection}
                className={`w-full sm:w-auto rounded ${nearBottom ? 'px-6 py-3.5' : 'px-5 py-2.5'} text-white ${(!anyAvailForSelection) ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}
              >
                Start Order
              </button>
              {darazUrl && (
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      let href = darazUrl as string;
                      try {
                        const u = new URL(darazUrl as string);
                        u.searchParams.set('utm_source', 'afalstore');
                        u.searchParams.set('utm_medium', 'lp');
                        u.searchParams.set('utm_campaign', 'buy_on_daraz');
                        href = u.toString();
                      } catch {}
                      try { track('ClickDaraz', { url: href, placement: 'floating' }); } catch {}
                      window.open(href, '_blank', 'noopener');
                    }
                  }}
                  className={`w-full sm:w-auto rounded ${nearBottom ? 'px-6 py-3.5' : 'px-5 py-2.5'} bg-[#F57224] hover:bg-[#e86619] text-white inline-flex items-center justify-center gap-2`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="opacity-90"><path d="M6 2a1 1 0 0 0-1 1v2H3a1 1 0 1 0 0 2h1l1.6 10.4A3 3 0 0 0 8.57 20H17a1 1 0 1 0 0-2H8.57a1 1 0 0 1-.99-.84L7.4 16H18a3 3 0 0 0 2.95-2.52l.9-5.4A1 1 0 0 0 20.88 6H7V3a1 1 0 0 0-1-1z"/></svg>
                  Daraz
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
