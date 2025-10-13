"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

// Simple select options for modes
const MODE_OPTIONS = [
  { value: 'free', label: 'Free shipping' },
  { value: 'coupon_free', label: 'Coupon grants free shipping' },
  { value: 'flat', label: 'Flat rate per order' },
  { value: 'per_item', label: 'Per item rate' },
  { value: 'per_kg', label: 'Per kg rate' },
] as const;

type Rule = {
  id: string;
  province_code: string | null;
  city_id: number | null;
  enabled: boolean;
  priority: number;
  mode: 'free'|'coupon_free'|'flat'|'per_item'|'per_kg';
  flat_amount: number | null;
  per_item_amount: number | null;
  base_amount: number | null;
  per_kg_amount: number | null;
  min_subtotal: number | null;
  coupon_code: string | null;
  eta_days: number | null;
  active_from: string | null;
  active_to: string | null;
};

type City = { id: number; code: string; name: string };

type Settings = {
  product_id: string;
  enable_city_rates: boolean;
  enable_province_rates: boolean;
  fallback_mode: 'free'|'coupon_free'|'flat'|'per_item'|'per_kg';
  fallback_flat_amount: number | null;
  fallback_per_item_amount: number | null;
  fallback_base_amount: number | null;
  fallback_per_kg_amount: number | null;
  free_over_subtotal: number | null;
  cod_fee: number | null;
};

export default function ShippingEditorPage() {
  const params = useParams() as { productId: string };
  const productId = params.productId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [product, setProduct] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);

  const [provinces, setProvinces] = useState<Array<{ code: string; name: string }>>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [cityProvince, setCityProvince] = useState<string>("");
  // Quick province rule inputs
  const [quickProv, setQuickProv] = useState<string>("");
  const [quickFlat, setQuickFlat] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = supabaseBrowser;
        const [{ data: p }, { data: s }, { data: r }, { data: prov }] = await Promise.all([
          sb.from('products').select('id, name, slug').eq('id', productId).maybeSingle(),
          sb.from('shipping_settings').select('*').eq('product_id', productId).maybeSingle(),
          sb.from('shipping_rules').select('*').eq('product_id', productId).order('priority', { ascending: false }),
          sb.from('provinces').select('code, name').order('name', { ascending: true }),
        ]);
        if (!p) throw new Error('Product not found');
        setProduct(p as any);
        if (s) setSettings(s as any); else {
          // initialize defaults local; will create on Save
          setSettings({
            product_id: productId,
            enable_city_rates: false,
            enable_province_rates: true,
            fallback_mode: 'flat',
            fallback_flat_amount: 0,
            fallback_per_item_amount: 0,
            fallback_base_amount: 0,
            fallback_per_kg_amount: 0,
            free_over_subtotal: null,
            cod_fee: 0,
          });
        }
        setRules((r || []) as any);
        setProvinces((prov || []) as any);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [productId]);

  // Load cities for the selected province (city pricing helper)
  useEffect(() => {
    (async () => {
      if (!settings?.enable_city_rates || !cityProvince) { setCities([]); return; }
      const { data } = await supabaseBrowser
        .from('cities')
        .select('id, code, name')
        .eq('province_code', cityProvince)
        .order('name', { ascending: true });
      setCities((data || []) as any);
    })();
  }, [settings?.enable_city_rates, cityProvince]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      // upsert
      const payload = { ...settings } as any;
      const { error } = await supabaseBrowser
        .from('shipping_settings')
        .upsert(payload, { onConflict: 'product_id' });
      if (error) throw error;
    } catch (e: any) {
      setError(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addRule = async (payload: Partial<Rule>) => {
    setSaving(true);
    setError(null);
    try {
      const ins = {
        product_id: productId,
        province_code: payload.province_code ?? null,
        city_id: payload.city_id ?? null,
        enabled: payload.enabled ?? true,
        priority: payload.priority ?? 0,
        mode: payload.mode ?? 'flat',
        flat_amount: payload.flat_amount ?? null,
        per_item_amount: payload.per_item_amount ?? null,
        base_amount: payload.base_amount ?? null,
        per_kg_amount: payload.per_kg_amount ?? null,
        min_subtotal: payload.min_subtotal ?? null,
        coupon_code: payload.coupon_code ?? null,
        eta_days: payload.eta_days ?? null,
      } as any;
      const { data, error } = await supabaseBrowser
        .from('shipping_rules')
        .insert(ins)
        .select('*')
        .single();
      if (error) throw error;
      setRules((prev) => [data as any, ...prev]);
    } catch (e: any) {
      setError(e?.message || 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  };

  const updateRule = async (id: string, patch: Partial<Rule>) => {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabaseBrowser
        .from('shipping_rules')
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } as any : r)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Delete this rule?')) return;
    const { error } = await supabaseBrowser.from('shipping_rules').delete().eq('id', id);
    if (!error) setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const cityDropdownEnabled = Boolean(settings?.enable_city_rates);
  const dedupedProvinces = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const p of provinces) { if (!m.has(p.code)) m.set(p.code, p); }
    return Array.from(m.values());
  }, [provinces]);

  if (loading) return <div>Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!product || !settings) return <div>Not found.</div>;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shipping – {product.name} ({product.slug})</h1>
        <a className="px-3 py-2 rounded border" href="/admin/shipping">Back</a>
        </div>

      {/* Settings */}
      <section className="space-y-4 border rounded p-4">
        <h2 className="font-medium">Settings</h2>
        <div className="flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={settings.enable_province_rates} onChange={(e)=> setSettings({ ...settings, enable_province_rates: e.target.checked })} /> Enable province-based rules
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={settings.enable_city_rates} onChange={(e)=> setSettings({ ...settings, enable_city_rates: e.target.checked })} /> Enable city-based rules (dropdown in checkout when city rules exist)
          </label>
        </div>
        {/* Quick province rule when province-based is enabled */}
        {settings.enable_province_rates && (
          <div className="grid md:grid-cols-[1fr_auto_auto] gap-2 items-end bg-gray-50 p-2 rounded">
            <div>
              <label className="block text-xs font-medium">Province</label>
              <select className="border rounded px-2 py-1 w-full" value={quickProv} onChange={(e)=> setQuickProv(e.target.value)}>
                <option value="">(Select province)</option>
                {provinces.map((p)=> (<option key={p.code} value={p.code}>{p.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Flat amount (PKR)</label>
              <input type="number" className="border rounded px-2 py-1 w-40" value={quickFlat} onChange={(e)=> setQuickFlat(e.target.value)} />
            </div>
            <div>
              <button
                className="px-3 py-1.5 rounded border"
                onClick={()=> {
                  if (!quickProv) return;
                  const amt = Number(quickFlat||'0');
                  addRule({ mode: 'flat', province_code: quickProv, flat_amount: amt, priority: 100, enabled: true });
                  setQuickFlat('');
                }}
              >Add province rate</button>
            </div>
          </div>
        )}

        {(settings.enable_province_rates || settings.enable_city_rates) && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Fallback mode</label>
            <select className="border rounded px-3 py-2 w-full" value={settings.fallback_mode} onChange={(e)=> setSettings({ ...settings, fallback_mode: e.target.value as any })}>
              {MODE_OPTIONS.map((m)=> (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
          </div>
          {settings.fallback_mode === 'flat' && (
            <div>
              <label className="block text-sm font-medium">Flat amount (PKR)</label>
              <input type="number" className="border rounded px-3 py-2 w-full" value={Number(settings.fallback_flat_amount||0)} onChange={(e)=> setSettings({ ...settings, fallback_flat_amount: Number(e.target.value||0) })} />
            </div>
          )}
          {settings.fallback_mode === 'per_item' && (
            <div>
              <label className="block text-sm font-medium">Per item amount (PKR)</label>
              <input type="number" className="border rounded px-3 py-2 w-full" value={Number(settings.fallback_per_item_amount||0)} onChange={(e)=> setSettings({ ...settings, fallback_per_item_amount: Number(e.target.value||0) })} />
            </div>
          )}
          {settings.fallback_mode === 'per_kg' && (
            <>
              <div>
                <label className="block text-sm font-medium">Base amount (PKR)</label>
                <input type="number" className="border rounded px-3 py-2 w-full" value={Number(settings.fallback_base_amount||0)} onChange={(e)=> setSettings({ ...settings, fallback_base_amount: Number(e.target.value||0) })} />
              </div>
              <div>
                <label className="block text-sm font-medium">Per kg amount (PKR)</label>
                <input type="number" className="border rounded px-3 py-2 w-full" value={Number(settings.fallback_per_kg_amount||0)} onChange={(e)=> setSettings({ ...settings, fallback_per_kg_amount: Number(e.target.value||0) })} />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium">Free shipping for orders over (PKR)</label>
            <input type="number" className="border rounded px-3 py-2 w-full" value={Number(settings.free_over_subtotal||0)} onChange={(e)=> setSettings({ ...settings, free_over_subtotal: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div>
            <label className="block text-sm font-medium">COD fee (PKR)</label>
            <input type="number" className="border rounded px-3 py-2 w-full" value={Number(settings.cod_fee||0)} onChange={(e)=> setSettings({ ...settings, cod_fee: Number(e.target.value||0) })} />
          </div>
        </div>
        )}
        <div>
          {(settings.enable_province_rates || settings.enable_city_rates) && (
            <button className={`px-4 py-2 rounded text-white ${saving? 'bg-gray-400':'bg-black hover:bg-gray-800'}`} disabled={saving} onClick={saveSettings}>{saving? 'Saving…':'Save settings'}</button>
          )}
        </div>
      </section>

      {/* Rules */}
      <section className="space-y-4 border rounded p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Rules</h2>
          <details>
            <summary className="cursor-pointer text-sm">Add rule</summary>
            <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block">Mode</label>
                <select id="r-mode" className="border rounded px-2 py-1 w-full">
                  {MODE_OPTIONS.map((m)=> (<option key={m.value} value={m.value}>{m.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block">Province (optional)</label>
                <select id="r-prov" className="border rounded px-2 py-1 w-full">
                  <option value="">(All)</option>
                  {provinces.map((p)=> (<option key={p.code} value={p.code}>{p.name}</option>))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block">City ID (optional)</label>
                <input id="r-cityid" placeholder="City ID (from Cities helper below)" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Flat (PKR)</label>
                <input id="r-flat" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Per item (PKR)</label>
                <input id="r-peritem" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Base (PKR)</label>
                <input id="r-base" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Per kg (PKR)</label>
                <input id="r-perkg" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Min subtotal (PKR)</label>
                <input id="r-min" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Coupon code</label>
                <input id="r-coupon" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">ETA days</label>
                <input id="r-eta" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block">Priority</label>
                <input id="r-priority" type="number" className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="md:col-span-2">
                <button
                  className="px-3 py-1 rounded border"
                  onClick={() => {
                    const mode = (document.getElementById('r-mode') as HTMLSelectElement).value as any;
                    const prov = (document.getElementById('r-prov') as HTMLSelectElement).value || null;
                    const cityIdStr = (document.getElementById('r-cityid') as HTMLInputElement).value.trim();
                    const flat = Number((document.getElementById('r-flat') as HTMLInputElement).value || '0');
                    const perItem = Number((document.getElementById('r-peritem') as HTMLInputElement).value || '0');
                    const base = Number((document.getElementById('r-base') as HTMLInputElement).value || '0');
                    const perKg = Number((document.getElementById('r-perkg') as HTMLInputElement).value || '0');
                    const min = (document.getElementById('r-min') as HTMLInputElement).value;
                    const coupon = (document.getElementById('r-coupon') as HTMLInputElement).value.trim();
                    const eta = (document.getElementById('r-eta') as HTMLInputElement).value;
                    const prio = (document.getElementById('r-priority') as HTMLInputElement).value;
                    addRule({
                      mode,
                      province_code: prov,
                      city_id: cityIdStr ? Number(cityIdStr) : null,
                      flat_amount: mode==='flat'? flat : null,
                      per_item_amount: mode==='per_item'? perItem : null,
                      base_amount: mode==='per_kg'? base : null,
                      per_kg_amount: mode==='per_kg'? perKg : null,
                      min_subtotal: min ? Number(min) : null,
                      coupon_code: mode==='coupon_free' ? (coupon || null) : null,
                      eta_days: eta ? Number(eta) : null,
                      priority: prio ? Number(prio) : 0,
                      enabled: true,
                    });
                  }}
                >Add</button>
              </div>
            </div>
          </details>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Enabled</th>
                <th className="p-2">Scope</th>
                <th className="p-2">Mode</th>
                <th className="p-2">Amounts</th>
                <th className="p-2">Min / Coupon / ETA</th>
                <th className="p-2">Priority</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">
                    <input type="checkbox" checked={Boolean(r.enabled)} onChange={(e)=> updateRule(r.id, { enabled: e.target.checked })} />
                  </td>
                  <td className="p-2">
                    {r.city_id ? `City#${r.city_id}` : (r.province_code || 'All')}
                  </td>
                  <td className="p-2">{r.mode}</td>
                  <td className="p-2">
                    {r.mode==='flat' && <>Flat: PKR {Number(r.flat_amount||0)}</>}
                    {r.mode==='per_item' && <>Per item: PKR {Number(r.per_item_amount||0)}</>}
                    {r.mode==='per_kg' && <>Base: PKR {Number(r.base_amount||0)} • Per kg: PKR {Number(r.per_kg_amount||0)}</>}
                    {r.mode==='coupon_free' && <>Coupon: {r.coupon_code||'—'}</>}
                    {r.mode==='free' && <>Free</>}
                  </td>
                  <td className="p-2">{r.min_subtotal ? `Min: PKR ${r.min_subtotal}` : '—'}{r.eta_days != null ? ` • ETA: ${r.eta_days}d` : ''}</td>
                  <td className="p-2">{r.priority}</td>
                  <td className="p-2">
                    <button className="px-2 py-1 rounded border text-xs" onClick={()=> deleteRule(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* City pricing helper (visible only when city-based rules are enabled) */}
      {settings.enable_city_rates && (
        <section className="space-y-3 border rounded p-4">
          <h2 className="font-medium">City pricing helper</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Province</label>
              <select className="border rounded px-3 py-2 w-full" value={cityProvince} onChange={(e)=> setCityProvince(e.target.value)}>
                <option value="">(Select province)</option>
                {dedupedProvinces.map((p)=> (<option key={p.code} value={p.code}>{p.name}</option>))}
              </select>
            </div>
          </div>
          {cityProvince && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {cities.map((c) => (
                <div key={c.id} className="border rounded p-2 flex items-center justify-between text-sm">
                  <div>{c.name}</div>
                  <button
                    className="px-2 py-1 rounded border"
                    title="Add flat city rule"
                    onClick={()=> addRule({ mode: 'flat', city_id: c.id, province_code: cityProvince, flat_amount: 0, priority: 100, enabled: true })}
                  >+ City rule</button>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-gray-600">Tip: Create a city rule to enable city dropdown in checkout for this product.</div>
        </section>
      )}

      {/* Bottom save */}
      <section className="mt-2 pt-3 border-t">
        <button className={`px-4 py-2 rounded text-white ${saving? 'bg-gray-400':'bg-black hover:bg-gray-800'}`} disabled={saving} onClick={saveSettings}>{saving? 'Saving…':'Save settings'}</button>
      </section>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {/* Help panel */}
      <aside className="hidden lg:block">
        <div className="border rounded p-4 bg-white shadow-sm space-y-3">
          <h2 className="font-medium">Steps</h2>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Set a <strong>Fallback</strong> (default price) in Settings.</li>
            <li>Check <strong>Enable province-based rules</strong> and add one <em>Flat rate per order</em> rule per province as needed.</li>
            <li>(Optional) Check <strong>Enable city-based rules</strong> and add city rules. City dropdown in checkout appears only when city rules exist.</li>
          </ol>
          <h3 className="font-medium mt-2">How shipping is chosen</h3>
          <ul className="text-sm space-y-1">
            <li>Precedence: <strong>City rule → Province rule → Fallback</strong>.</li>
            <li><strong>Free shipping for orders over (PKR)</strong> overrides all rates.</li>
            <li><strong>COD fee</strong> is appended at the end if configured.</li>
          </ul>
          <h3 className="font-medium mt-2">Add rule fields</h3>
          <ul className="text-sm space-y-1">
            <li><strong>Mode</strong>: free, coupon_free, flat (per order), per_item, or per_kg.</li>
            <li><strong>Province</strong>: leave blank for all provinces or pick one for province-wide pricing.</li>
            <li><strong>City ID</strong>: leave blank for province rules; set for a city rule (from Cities helper).</li>
            <li><strong>Amounts</strong>: only fill the fields for the chosen Mode (Flat, Per item, or Base + Per kg).</li>
            <li><strong>Min subtotal</strong>: only applies when subtotal ≥ amount.</li>
            <li><strong>Coupon code</strong>: used with coupon_free mode.</li>
            <li><strong>ETA days</strong>: optional estimated delivery time.</li>
            <li><strong>Priority</strong>: higher number wins if multiple rules match.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
