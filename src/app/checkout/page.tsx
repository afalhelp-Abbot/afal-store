"use client";
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";
import { ensurePixel, track } from "@/lib/pixel";

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
  weight_kg?: number | null;
};

type PromotionRow = {
  id: string;
  product_id?: string;
  name: string;
  active: boolean;
  type: 'percent' | 'bxgy';
  min_qty: number;
  discount_pct: number | null;
  free_qty: number | null;
  start_at?: string | null;
  end_at?: string | null;
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
  const [logoByProduct, setLogoByProduct] = useState<Record<string, string>>({});
  const [successTotals, setSuccessTotals] = useState<{ subtotal: number; shipping: number; total: number }>({ subtotal: 0, shipping: 0, total: 0 });
  // Provinces / Cities sourced from DB
  const [provinces, setProvinces] = useState<Array<{ code: string; name: string }>>([]);
  const [cities, setCities] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [enableCityRates, setEnableCityRates] = useState<boolean>(false);
  const [hasCityRules, setHasCityRules] = useState<boolean>(false);
  const [provinceCode, setProvinceCode] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [productId, setProductId] = useState<string | null>(null);
  const [productSlug, setProductSlug] = useState<string | null>(null);
  const [shippingAmount, setShippingAmount] = useState<number | null>(null);
  const [shippingLoading, setShippingLoading] = useState<boolean>(false);
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  // Meta Pixel config (per product)
  const [pixelCfg, setPixelCfg] = useState<null | { enabled: boolean; pixel_id: string | null; content_id_source: 'sku' | 'variant_id'; events: any }>(null);
  const firedInitRef = useRef(false);
  const firedAddPaymentRef = useRef(false);
  const firedPurchaseRef = useRef(false);

  const formRef = useRef<HTMLFormElement>(null);

  // Helper: sync lines to URL
  const replaceUrlWithLines = (newLines: CartItem[]) => {
    const itemsParam = encodeURIComponent(JSON.stringify(newLines));
    // Preserve original `from` param so empty-cart redirects can return to LP
    const fromParam = search.get('from');
    const qs = `?items=${itemsParam}` + (fromParam ? `&from=${fromParam}` : '');
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
          .select("id, sku, price, active, product_id, thumb_url, weight_kg")
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
            weight_kg: (r as any).weight_kg ?? null,
          };
        }
        // Fetch thumbnails per product
        const productIds = Array.from(new Set((vrows || []).map((r: any) => r.product_id).filter(Boolean)));
        if (productIds.length) {
          const [{ data: mediaRows }, { data: productsRows }] = await Promise.all([
            supabaseBrowser
              .from("product_media")
              .select("product_id, url, thumb_url, type, sort")
              .in("product_id", productIds)
              .order("sort", { ascending: true }),
            supabaseBrowser
              .from("products")
              .select("id, logo_url, slug")
              .in("id", productIds),
          ]);
          setProductId(productIds[0] as string);
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
          const logoMap: Record<string, string> = {};
          for (const p of productsRows || []) {
            const pid = (p as any).id as string;
            const l = (p as any).logo_url as string | null;
            if (l) logoMap[pid] = l;
            // capture slug for the first product (LP back link)
            if (!productSlug) setProductSlug((p as any).slug || null);
          }
          setLogoByProduct(logoMap);
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

        // Load provinces list (DB)
        const { data: provRows } = await supabaseBrowser
          .from("provinces")
          .select("code, name")
          .order("name", { ascending: true });
        setProvinces((provRows || []) as any);

        // Determine shipping settings from the first product (assumes single-product checkout for LP)
        const firstPid = productIds[0] as string | undefined;
        if (firstPid) {
          const [{ data: settings }, { data: anyCityRule }] = await Promise.all([
            supabaseBrowser
              .from("shipping_settings")
              .select("enable_city_rates")
              .eq("product_id", firstPid)
              .maybeSingle(),
            supabaseBrowser
              .from("shipping_rules")
              .select("id")
              .eq("product_id", firstPid)
              .not("city_id", "is", null)
              .limit(1)
          ]);
          setEnableCityRates(Boolean((settings as any)?.enable_city_rates));
          setHasCityRules(Boolean((anyCityRule || []).length));

          // Load promotions for this product so checkout subtotal matches LP drawer
          const { data: promoRows } = await supabaseBrowser
            .from('product_promotions')
            .select('id, product_id, name, active, type, min_qty, discount_pct, free_qty, start_at, end_at')
            .eq('product_id', firstPid);
          setPromotions((promoRows || []) as any);
        } else {
          setEnableCityRates(false);
          setHasCityRules(false);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load checkout");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsParam]);

  // When province changes and city-rates are enabled, fetch cities
  useEffect(() => {
    (async () => {
      if (!enableCityRates || !provinceCode) { setCities([]); return; }
      const { data } = await supabaseBrowser
        .from("cities")
        .select("id, code, name")
        .eq("province_code", provinceCode)
        .order("name", { ascending: true });
      setCities((data || []) as any);
    })();
  }, [enableCityRates, provinceCode]);

  // Load per-product Meta Pixel config
  useEffect(() => {
    (async () => {
      if (!productId) { setPixelCfg(null); return; }
      const { data: px } = await supabaseBrowser
        .from('product_pixel')
        .select('enabled, pixel_id, content_id_source, events')
        .eq('product_id', productId)
        .maybeSingle();
      if (px) {
        setPixelCfg({
          enabled: !!(px as any).enabled,
          pixel_id: (px as any).pixel_id || null,
          content_id_source: ((px as any).content_id_source === 'variant_id' ? 'variant_id' : 'sku'),
          events: (px as any).events || {},
        });
      } else {
        setPixelCfg(null);
      }
    })();
  }, [productId]);

  // Raw subtotal of items (before promotions)
  const rawSubtotal = useMemo(() => {
    return lines.reduce((acc, ln) => acc + (variants[ln.variant_id]?.price || 0) * ln.qty, 0);
  }, [lines, variants]);

  // Total quantity across all lines
  const totalQty = useMemo(() => {
    return lines.reduce((acc, ln) => acc + (ln.qty || 0), 0);
  }, [lines]);

  // Apply best promotion (same logic as LP OrderDrawer).
  const { subtotal, discount, promoLabel } = useMemo(() => {
    if (!promotions || promotions.length === 0) return { subtotal: rawSubtotal, discount: 0, promoLabel: null as string | null };
    if (!rawSubtotal || rawSubtotal <= 0 || totalQty <= 0) return { subtotal: rawSubtotal, discount: 0, promoLabel: null as string | null };
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
        d = rawSubtotal * (p.discount_pct / 100);
      } else if (p.type === 'bxgy' && p.free_qty && p.free_qty > 0 && p.min_qty > 0) {
        const unitPrice = rawSubtotal / totalQty;
        const freeUnits = Math.floor(totalQty / p.min_qty) * p.free_qty;
        d = freeUnits * unitPrice;
      }
      if (d > best.d) {
        best = { d, label: p.name || null };
      }
    }
    const fs = Math.max(0, rawSubtotal - best.d);
    return { subtotal: fs, discount: best.d, promoLabel: best.label };
  }, [promotions, rawSubtotal, totalQty]);

  // Compute total weight kg
  const totalWeightKg = useMemo(() => {
    return lines.reduce((acc, ln) => acc + ((variants[ln.variant_id]?.weight_kg || 0) * ln.qty), 0);
  }, [lines, variants]);

  // Fire InitiateCheckout once when items + pixel config ready
  useEffect(() => {
    if (success) return; // do not fire after success
    if (!pixelCfg || !pixelCfg.enabled || !pixelCfg.pixel_id) return;
    if (pixelCfg.events && pixelCfg.events.initiate_checkout === false) return;
    if (firedInitRef.current) return;
    if (!lines.length) return;
    // Wait until we have variant pricing for all lines; avoid firing with 0 value
    const allPriced = lines.every((ln) => {
      const v = variants[ln.variant_id];
      return v && Number(v.price || 0) > 0;
    });
    if (!allPriced) return;
    const ok = ensurePixel(pixelCfg.pixel_id);
    if (!ok) return;
    const build = () => {
      const contents = lines.map((ln) => ({
        id: (pixelCfg.content_id_source === 'variant_id' ? ln.variant_id : (variants[ln.variant_id]?.sku || ln.variant_id)),
        quantity: ln.qty,
        item_price: Number(variants[ln.variant_id]?.price || 0),
      }));
      const value = lines.reduce((s, ln) => s + (Number(variants[ln.variant_id]?.price || 0) * ln.qty), 0);
      return { contents, value };
    };
    const { contents, value } = build();
    const trackOk = track('InitiateCheckout', { contents, value, currency: 'PKR', content_type: 'product' });
    if (trackOk) {
      firedInitRef.current = true;
    }
  }, [pixelCfg, lines, variants, success]);

  // Call shipping quote when province/city/qty changes and we have productId
  useEffect(() => {
    (async () => {
      if (!productId) { setShippingAmount(null); return; }
      if (!provinceCode) { setShippingAmount(null); return; }
      // City can be optional unless dropdown is enforced
      try {
        setShippingLoading(true);
        const payload = {
          product_id: productId,
          province_code: provinceCode || null,
          city: city || null,
          coupon: null,
          items: lines.map((ln) => ({ variant_id: ln.variant_id, qty: ln.qty })),
          subtotal,
          total_weight_kg: totalWeightKg,
        };
        const res = await fetch('/api/shipping/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Quote failed');
        setShippingAmount(Number(data?.amount || 0));
      } catch (e) {
        setShippingAmount(null);
      } finally {
        setShippingLoading(false);
      }
    })();
  }, [productId, provinceCode, city, lines, subtotal, totalWeightKg]);

  

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
      // Ensure shipping has been calculated (prevents showing 0 in success panel)
      if (shippingAmount == null && !shippingLoading) {
        setError('Please select province (and city if applicable) and wait for shipping to calculate.');
        setPlacing(false);
        return;
      }

      // Fire AddPaymentInfo once when user submits
      if (!firedAddPaymentRef.current && pixelCfg && pixelCfg.enabled && pixelCfg.pixel_id && !(pixelCfg.events && pixelCfg.events.add_payment_info === false)) {
        const okPx = ensurePixel(pixelCfg.pixel_id);
        if (okPx) {
          const contents = lines.map((ln) => ({
            id: (pixelCfg.content_id_source === 'variant_id' ? ln.variant_id : (variants[ln.variant_id]?.sku || ln.variant_id)),
            quantity: ln.qty,
            item_price: Number(variants[ln.variant_id]?.price || 0),
          }));
          const value = lines.reduce((s, ln) => s + (Number(variants[ln.variant_id]?.price || 0) * ln.qty), 0);
          track('AddPaymentInfo', { contents, value, currency: 'PKR', content_type: 'product' });
          firedAddPaymentRef.current = true;
        }
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
      // Read Meta cookies for CAPI matching
      const readCookie = (name: string) => {
        try {
          const v = (`; ${document.cookie}`).split(`; ${name}=`).pop()?.split(';')[0];
          return v || null;
        } catch { return null; }
      };
      const fbp = readCookie('_fbp');
      const fbc = readCookie('_fbc');
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
        shipping: {
          amount: Number(shippingAmount || 0),
          province_code: province0 || undefined,
          city: city0 || undefined,
        },
        fbMeta: { fbp: fbp || null, fbc: fbc || null },
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
      const ship = Number(shippingAmount || 0);
      setSuccessTotals({ subtotal: s, shipping: ship, total: s + ship });

      // Fire Purchase (exclude shipping) after success
      if (!firedPurchaseRef.current && pixelCfg && pixelCfg.enabled && pixelCfg.pixel_id && !(pixelCfg.events && pixelCfg.events.purchase === false)) {
        const okPx2 = ensurePixel(pixelCfg.pixel_id);
        if (okPx2) {
          const contents = lines.map((ln) => ({
            id: (pixelCfg.content_id_source === 'variant_id' ? ln.variant_id : (variants[ln.variant_id]?.sku || ln.variant_id)),
            quantity: ln.qty,
            item_price: Number(variants[ln.variant_id]?.price || 0),
          }));
          const value = Number(subtotal) || 0; // exclude shipping per requirement
          // Include event_id returned from server (order_id) to dedupe with CAPI
          track('Purchase', { contents, value, currency: 'PKR', content_type: 'product', event_id: data.order_id });
          firedPurchaseRef.current = true;
        }
      }
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
        <div className="flex items-center gap-2">
          {(() => {
            // show first product logo if available
            const firstPid = Object.values(variants)[0]?.product_id as string | undefined;
            const logo = firstPid ? logoByProduct[firstPid] : undefined;
            return logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo" className="h-6 w-auto object-contain rounded border bg-white p-0.5" />
            ) : null;
          })()}
          <h1 className="text-2xl font-semibold">Checkout</h1>
        </div>
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
                  <Link href={productSlug ? `/lp/${productSlug}` : "/"} className="inline-block bg-black text-white px-4 py-2 rounded">Continue Shopping</Link>
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
            <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-3">
              Returns are accepted only for product defects within <span className="font-medium">7 days of receiving</span>, with original packaging intact. Our support team will inspect and, once approved, refunds are issued within <span className="font-medium">14 days</span> via Easypaisa. See full policy: <a href="/return-policy" className="text-blue-600 hover:underline">Return Policy</a>.
            </div>
            <div className="text-sm text-gray-600">
              By placing the order you agree to our <a href="/return-policy" className="text-blue-600 hover:underline">Return Policy</a>.
            </div>
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
              {(enableCityRates && hasCityRules) && provinceCode ? (
                <select
                  value={city}
                  onChange={(e)=> setCity(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="">Select city</option>
                  {cities.map((c)=> (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    name="city"
                    value={city}
                    onChange={(e)=> setCity(e.target.value)}
                    list={provinceCode ? "city-options" : undefined}
                    className="border rounded px-3 py-2 w-full"
                    placeholder="City"
                  />
                  {/* Provide suggestions when typing if a province is selected */}
                  {provinceCode && cities.length > 0 && (
                    <datalist id="city-options">
                      {cities.map((c)=> (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
              {/* Mirror city into a hidden input when using select to keep form payload consistent */}
              <input type="hidden" name="city" value={city} />
            </div>
            <div>
              <label className="block text-sm">Province</label>
              <select
                name="province_code"
                required
                value={provinceCode}
                onChange={(e)=> { setProvinceCode(e.target.value); setCity(""); }}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="">Select province</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm">Address</label>
              <input
                name="address"
                required
                className="border rounded px-3 py-2 w-full"
              />
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
          <div className="flex items-center gap-2">
            {(() => {
              const firstPid = Object.values(variants)[0]?.product_id as string | undefined;
              const logo = firstPid ? logoByProduct[firstPid] : undefined;
              return logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo" className="h-5 w-auto object-contain rounded border bg-white p-0.5" />
              ) : null;
            })()}
            <h2 className="font-medium">Order Summary</h2>
          </div>
          {discount > 0 && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2 py-1.5">
              Congrats! You got
              {" "}
              <span className="font-semibold">{promoLabel || 'a promotion'}</span>
              {" "}
              discount (saving PKR {Number(discount).toLocaleString()}).
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span>Items subtotal</span>
            <span>
              PKR {Number(success ? successTotals.subtotal : subtotal).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Shipping</span>
            <span>
              {success ? (
                `PKR ${Number(successTotals.shipping).toLocaleString()}`
              ) : shippingLoading ? (
                'Calculating…'
              ) : shippingAmount != null ? (
                `PKR ${Number(shippingAmount).toLocaleString()}`
              ) : (
                'Calculated after address'
              )}
            </span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between font-semibold">
            <span>Total</span>
            <span>
              {(() => {
                const base = Number(success ? successTotals.subtotal : subtotal) || 0;
                const ship = success ? Number(successTotals.shipping) || 0 : Number(shippingAmount || 0);
                return `PKR ${(base + ship).toLocaleString()}`;
              })()}
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
