"use client";
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

type CartItem = { variant_id: string; qty: number };

type VariantRow = {
  id: string;
  sku: string;
  price: number;
  product_id?: string;
  thumb_url?: string | null;
  color?: string;
  size?: string;
  model?: string;
  pack?: string;
};

const PK_PROVINCES = [
  { code: "SD", name: "Sindh" },
  { code: "PB", name: "Punjab" },
  { code: "KP", name: "Khyber Pakhtunkhwa" },
  { code: "BL", name: "Balochistan" },
  { code: "ICT", name: "Islamabad Capital Territory" },
  { code: "AJK", name: "Azad Jammu & Kashmir" },
  { code: "GB", name: "Gilgit-Baltistan" },
];

function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const itemsParam = search.get("items");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ order_id: string } | null>(null);
  const [lines, setLines] = useState<Array<CartItem>>([]);
  const [variants, setVariants] = useState<Record<string, VariantRow>>({});
  const [thumbByProduct, setThumbByProduct] = useState<Record<string, string>>({});
  const [successTotals, setSuccessTotals] = useState<{ subtotal: number; shipping: number; total: number }>({ subtotal: 0, shipping: 0, total: 0 });

  const formRef = useRef<HTMLFormElement>(null);

  // Helper: sync lines to URL
  const replaceUrlWithLines = (newLines: CartItem[]) => {
    const itemsParam = encodeURIComponent(JSON.stringify(newLines));
    const qs = `?items=${itemsParam}`;
    router.replace(`/checkout${qs}`);
  };

  // If cart becomes empty (e.g., removed last item), send user back to LP or home
  useEffect(() => {
    if (loading) return;
    if (success) return; // keep thank-you visible
    if (lines.length === 0) {
      try {
        const urlFrom = search.get('from');
        const ref = document.referrer;
        const origin = window.location.origin;
        const fromUrl = urlFrom ? new URL(decodeURIComponent(urlFrom), origin).toString() : '';
        const sameOriginFrom = !!fromUrl && new URL(fromUrl).origin === origin;
        const sameOriginRef = !!ref && new URL(ref, origin).origin === origin;
        // Prefer explicit from param (LP), then referrer, else home
        const target = sameOriginFrom ? fromUrl : sameOriginRef ? ref : "/";
        // Use replace to avoid piling history entries
        router.replace(target);
      } catch {
        router.replace("/");
      }
    }
  }, [lines.length, loading, success, router, search]);

  // Handlers for qty and remove
  const setQtyAt = (idx: number, qty: number) => {
    setLines((prev) => {
      const next = prev.map((ln, i) => (i === idx ? { ...ln, qty: Math.max(0, Math.floor(qty || 0)) } : ln)).filter((ln) => ln.qty > 0);
      replaceUrlWithLines(next);
      return next;
    });
  };
  const incQty = (idx: number) => setQtyAt(idx, (lines[idx]?.qty || 0) + 1);
  const decQty = (idx: number) => setQtyAt(idx, (lines[idx]?.qty || 0) - 1);
  const removeLine = (idx: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      replaceUrlWithLines(next);
      return next;
    });
  };

  // Parse items from URL and fetch variant info
  useEffect(() => {
    (async () => {
      try {
        setError(null);
        if (!itemsParam) {
          setLoading(false);
          return;
        }
        const parsed: CartItem[] = JSON.parse(decodeURIComponent(itemsParam));
        const normalized = parsed.filter((x) => x && x.variant_id && (x.qty || 0) > 0);
        setLines(normalized);
        if (normalized.length === 0) {
          setLoading(false);
          return;
        }
        const ids = normalized.map((x) => x.variant_id);
        // Fetch variants
        const { data: vrows, error: vErr } = await supabaseBrowser
          .from("variants")
          .select("id, sku, price, active, product_id, thumb_url")
          .in("id", ids)
          .eq("active", true);
        if (vErr) throw vErr;
        const vmap: Record<string, VariantRow> = {};
        for (const r of vrows || []) {
          vmap[(r as any).id] = {
            id: (r as any).id,
            sku: (r as any).sku,
            price: Number((r as any).price) || 0,
            product_id: (r as any).product_id,
            thumb_url: (r as any).thumb_url || null,
          };
        }
        // Fetch thumbnails per product
        const productIds = Array.from(new Set((vrows || []).map((r: any) => r.product_id).filter(Boolean)));
        if (productIds.length) {
          const { data: mediaRows } = await supabaseBrowser
            .from("product_media")
            .select("product_id, url, thumb_url, type, sort")
            .in("product_id", productIds)
            .order("sort", { ascending: true });
          const map: Record<string, string> = {};
          for (const m of mediaRows || []) {
            const pid = (m as any).product_id as string;
            if (!map[pid]) {
              if ((m as any).type === 'image') {
                map[pid] = (m as any).thumb_url || (m as any).url;
              }
            }
          }
          setThumbByProduct(map);
        }
        // Fetch option labels via join
        const { data: links } = await supabaseBrowser
          .from("variant_option_values")
          .select(
            "variant_id, option_values!variant_option_values_option_value_id_fkey(value, option_type_id)"
          )
          .in("variant_id", ids);
        // Get type ids for mapping labels
        const [colorType, sizeType, modelType, packType] = await Promise.all([
          supabaseBrowser.from("option_types").select("id").eq("name", "Color").maybeSingle(),
          supabaseBrowser.from("option_types").select("id").eq("name", "Size").maybeSingle(),
          supabaseBrowser.from("option_types").select("id").eq("name", "Model").maybeSingle(),
          supabaseBrowser.from("option_types").select("id").eq("name", "Package").maybeSingle(),
        ]);
        const colorId = (colorType.data as any)?.id;
        const sizeId = (sizeType.data as any)?.id;
        const modelId = (modelType.data as any)?.id;
        const packId = (packType.data as any)?.id;
        for (const l of links || []) {
          const vId = (l as any).variant_id as string;
          const ov = (l as any).option_values as any;
          if (!ov || !vmap[vId]) continue;
          if (ov.option_type_id === colorId) vmap[vId].color = ov.value;
          if (ov.option_type_id === sizeId) vmap[vId].size = ov.value;
          if (ov.option_type_id === modelId) vmap[vId].model = ov.value;
          if (ov.option_type_id === packId) vmap[vId].pack = ov.value;
        }
        setVariants(vmap);
      } catch (e: any) {
        setError(e?.message || "Failed to load checkout");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsParam]);

  const subtotal = useMemo(() => {
    return lines.reduce((acc, ln) => acc + (variants[ln.variant_id]?.price || 0) * ln.qty, 0);
  }, [lines, variants]);

  // Basic client-side validators
  const isValidName = (s: string) => /^[A-Za-z ]+$/.test(s.trim());
  // Pakistan numbers: require +92 then 10 digits (e.g., +923001234567)
  const isValidPkPhone = (s: string) => /^\+92\d{10}$/.test(s.trim());
  const isValidEmail = (s: string) => /.+@.+\..+/.test(s.trim());

  // Controlled phone field to always keep "+92" prefix
  const [phone, setPhone] = useState("+92");
  const onPhoneChange = (v: string) => {
    // keep only + and digits
    let s = v.replace(/[^+\d]/g, "");
    // normalize to start with +92
    if (!s.startsWith("+92")) {
      // remove any leading + or 92 then force +92
      s = "+92" + s.replace(/^\+?92?/, "");
    }
    // allow only 10 digits after +92
    const rest = s.slice(3).replace(/\D/g, "").slice(0, 10);
    setPhone("+92" + rest);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    try {
      setPlacing(true);
      setError(null);
      // Read form values early for validation
      const fd0 = new FormData(formRef.current);
      const name0 = String(fd0.get("name") || "").trim();
      const phone0 = phone.trim();
      const email0 = String(fd0.get("email") || "").trim();
      const city0 = String(fd0.get("city") || "").trim();
      const address0 = String(fd0.get("address") || "").trim();
      const province0 = String(fd0.get("province_code") || "").trim();

      if (!isValidName(name0)) {
        throw new Error("Please enter a valid full name (letters and spaces only)");
      }
      if (!isValidPkPhone(phone0)) {
        throw new Error("Phone must be in Pakistan format +92XXXXXXXXXX (10 digits after +92)");
      }
      if (email0 && !isValidEmail(email0)) {
        throw new Error("Please enter a valid email address or leave it empty");
      }
      if (!city0 || !address0 || !province0) {
        throw new Error("City, Province, and Address are required");
      }
      // Validate availability first
      const ids = lines.map((x) => x.variant_id);
      if (ids.length) {
        const { data: inv } = await supabaseBrowser
          .from('inventory')
          .select('variant_id, stock_on_hand, reserved')
          .in('variant_id', ids);
        const avail: Record<string, number> = {};
        for (const r of inv || []) {
          const id = (r as any).variant_id as string;
          const on = Number((r as any).stock_on_hand) || 0;
          const res = Number((r as any).reserved) || 0;
          avail[id] = on - res;
        }
        const over: Array<{ sku: string; need: number; have: number }> = [];
        for (const ln of lines) {
          const have = avail[ln.variant_id] ?? 0;
          if (ln.qty > have) {
            const sku = variants[ln.variant_id]?.sku || ln.variant_id;
            over.push({ sku, need: ln.qty, have });
          }
        }
        if (over.length) {
          setError(
            'Insufficient stock for: ' +
            over.map((o) => `${o.sku} (need ${o.need}, have ${o.have})`).join(', ')
          );
          setPlacing(false);
          return;
        }
      }
      const fd = new FormData(formRef.current);
      const payload = {
        customer: {
          name: name0,
          email: email0 || undefined,
          phone: phone0,
          address: address0,
          city: city0,
          province_code: province0 || undefined,
        },
        items: lines,
        payment: { method: "COD" as const },
      };
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to place order");
      // success: store id, clear cart in UI + URL, reset form
      setSuccess({ order_id: data.order_id });
      // capture totals before clearing
      const s = Number(subtotal) || 0;
      const ship = 0;
      setSuccessTotals({ subtotal: s, shipping: ship, total: s + ship });
      replaceUrlWithLines([]);
      setLines([]);
      try { formRef.current?.reset(); } catch {}
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <div className="max-w-5xl mx-auto p-6">Loading checkout…</div>;
  // After success we clear cart; still show Thank You panel below
  if (!lines.length && !success) {
    // Fallback empty state in case redirect is blocked or user navigated directly
    const ref = typeof document !== 'undefined' ? document.referrer : '';
    let backHref = '/';
    try {
      if (ref && new URL(ref, typeof window !== 'undefined' ? window.location.origin : undefined).origin === (typeof window !== 'undefined' ? window.location.origin : '')) {
        backHref = ref;
      }
    } catch {}
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="border rounded p-6 text-center space-y-3">
          <div className="text-lg">Your cart is empty.</div>
          <a href={backHref} className="inline-block bg-black text-white px-4 py-2 rounded">Continue Shopping</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
      {/* Left: Items and address */}
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        {/* Items list or Thank You */}
        {success ? (
          <div className="rounded-lg border p-6 bg-gradient-to-r from-green-50 to-emerald-50 text-green-900 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="text-2xl">✅</div>
              <div>
                <h2 className="text-xl font-semibold mb-1">Thank you! Your order has been placed.</h2>
                <p className="">Order ID: <span className="font-semibold">#{success.order_id}</span></p>
                <p className="mt-1 text-sm text-green-800">We will contact you shortly to confirm and arrange delivery.</p>
                <div className="mt-4 flex gap-3">
                  <Link href="/" className="inline-block bg-black text-white px-4 py-2 rounded">Continue Shopping</Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="space-y-3 lg:hidden">
              {lines.map((ln, i) => {
                const v = variants[ln.variant_id];
                const variantText = [v?.color, v?.size, v?.pack].filter(Boolean).join(" / ") || v?.sku;
                const lineTotal = (v?.price || 0) * ln.qty;
                return (
                  <div key={i} className="border rounded p-3">
                    <div className="flex items-center gap-3">
                      {/* Prefer variant-specific thumbnail; fall back to product-level */}
                      {v?.thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumb_url as string} alt={v?.sku || 'Variant'} className="w-12 h-12 object-cover rounded border" />
                      ) : v?.product_id ? (
                        thumbByProduct[v.product_id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbByProduct[v.product_id]} alt={v?.sku || 'Product'} className="w-12 h-12 object-cover rounded border" />
                        ) : (
                          <div className="w-12 h-12 rounded border bg-gray-100" />
                        )
                      ) : null}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{v?.sku || ln.variant_id.slice(0, 8)}</div>
                        <div className="text-sm text-gray-600 truncate">{variantText}</div>
                      </div>
                      <div className="ml-auto text-right whitespace-nowrap text-sm">PKR {Number(v?.price || 0).toLocaleString()}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-sm text-gray-600">Line Total: <span className="font-medium text-gray-800">PKR {Number(lineTotal).toLocaleString()}</span></div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => decQty(i)} className="border rounded px-3 py-1">-</button>
                        <input
                          type="number"
                          min={1}
                          value={ln.qty}
                          onChange={(e)=>setQtyAt(i, Number(e.target.value))}
                          className="w-14 text-center border rounded px-2 py-1"
                        />
                        <button type="button" onClick={() => incQty(i)} className="border rounded px-3 py-1">+</button>
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <button type="button" onClick={() => removeLine(i)} className="text-red-600 hover:underline text-sm">Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="border rounded hidden lg:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3">Item</th>
                    <th className="text-left p-3">Variant</th>
                    <th className="text-right p-3">Unit Price</th>
                    <th className="text-right p-3">Qty</th>
                    <th className="text-right p-3">Line Total</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln, i) => {
                    const v = variants[ln.variant_id];
                    const variantText = [v?.color, v?.size, v?.pack].filter(Boolean).join(" / ") || v?.sku;
                    const lineTotal = (v?.price || 0) * ln.qty;
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-3 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {/* Prefer variant-specific thumbnail; fall back to product-level */}
                            {v?.thumb_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={v.thumb_url as string} alt={v?.sku || 'Variant'} className="w-10 h-10 object-cover rounded border" />
                            ) : v?.product_id ? (
                              thumbByProduct[v.product_id] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumbByProduct[v.product_id]} alt={v?.sku || 'Product'} className="w-10 h-10 object-cover rounded border" />
                              ) : (
                                <div className="w-10 h-10 rounded border bg-gray-100" />
                              )
                            ) : null}
                            <span>{v?.sku || ln.variant_id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="p-3 text-gray-600">{variantText}</td>
                        <td className="p-3 text-right">PKR {Number(v?.price || 0).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => decQty(i)} className="border rounded px-2 py-1">-</button>
                            <input
                              type="number"
                              min={1}
                              value={ln.qty}
                              onChange={(e)=>setQtyAt(i, Number(e.target.value))}
                              className="w-14 text-right border rounded px-2 py-1"
                            />
                            <button type="button" onClick={() => incQty(i)} className="border rounded px-2 py-1">+</button>
                          </div>
                        </td>
                        <td className="p-3 text-right">PKR {Number(lineTotal).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <button type="button" onClick={() => removeLine(i)} className="text-red-600 hover:underline">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Address & payment */}
        {success ? null : (
          <form ref={formRef} onSubmit={handlePlaceOrder} className="grid grid-cols-1 gap-4">
            {error && (
              <div className="border rounded p-3 text-sm bg-red-50 text-red-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm">Name</label>
              <input
                name="name"
                required
                placeholder="First Middle Last"
                className="border rounded px-3 py-2 w-full"
                pattern="[A-Za-z ]+"
                title="Letters and spaces only"
              />
            </div>
            <div>
              <label className="block text-sm">Phone</label>
              <input
                name="phone"
                required
                placeholder="+923001234567"
                className="border rounded px-3 py-2 w-full"
                pattern="\+92\d{10}"
                title="Pakistan format: +92 followed by 10 digits"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm">Email (optional)</label>
              <input name="email" type="email" className="border rounded px-3 py-2 w-full" placeholder="name@example.com" />
            </div>
            <div>
              <label className="block text-sm">City</label>
              <input name="city" required className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm">Province</label>
              <select name="province_code" required className="border rounded px-3 py-2 w-full">
                <option value="">Select province</option>
                {PK_PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Address</label>
              <input name="address" required className="border rounded px-3 py-2 w-full" />
            </div>
            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={placing}
                className={`rounded px-5 py-2.5 text-white ${placing ? "bg-gray-400" : "bg-black hover:bg-gray-900"}`}
              >
                {placing ? "Placing…" : "Place Order (COD)"}
              </button>
              <button type="button" className="px-4 py-2 rounded border" onClick={() => router.back()}>Back</button>
            </div>
          </form>
        )}
      </div>

      {/* Right: Summary (aligned with table top on desktop) */}
      <aside className="lg:sticky lg:top-0 lg:mt-14">
        <div className="border rounded p-4 space-y-3 bg-white shadow-sm">
          <h2 className="font-medium">Order Summary</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Items subtotal</span>
            <span>
              PKR {Number(success ? successTotals.subtotal : subtotal).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Shipping</span>
            <span>{success ? `PKR ${Number(successTotals.shipping).toLocaleString()}` : 'Calculated after address'}</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between font-semibold">
            <span>Total</span>
            <span>
              PKR {Number(success ? successTotals.total : subtotal).toLocaleString()}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto p-6">Loading checkout…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}
