"use client";
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type CartItem = { variant_id: string; qty: number };

type VariantRow = {
  id: string;
  sku: string;
  price: number;
  color?: string;
  size?: string;
  model?: string;
  pack?: string;
};

const PK_PROVINCES = [
  { code: "Sindh", name: "Sindh" },
  { code: "Punjab", name: "Punjab" },
  { code: "KPK", name: "Khyber Pakhtunkhwa" },
  { code: "Balochistan", name: "Balochistan" },
  { code: "ICT", name: "Islamabad Capital Territory" },
  { code: "AJK", name: "Azad Jammu & Kashmir" },
  { code: "GB", name: "Gilgit-Baltistan" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const search = useSearchParams();
  const itemsParam = search.get("items");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ order_id: string } | null>(null);
  const [lines, setLines] = useState<Array<CartItem>>([]);
  const [variants, setVariants] = useState<Record<string, VariantRow>>({});

  const formRef = useRef<HTMLFormElement>(null);

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
          .select("id, sku, price, active")
          .in("id", ids)
          .eq("active", true);
        if (vErr) throw vErr;
        const vmap: Record<string, VariantRow> = {};
        for (const r of vrows || []) {
          vmap[(r as any).id] = {
            id: (r as any).id,
            sku: (r as any).sku,
            price: Number((r as any).price) || 0,
          };
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

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    try {
      setPlacing(true);
      setError(null);
      const fd = new FormData(formRef.current);
      const payload = {
        customer: {
          name: String(fd.get("name") || "").trim(),
          email: String(fd.get("email") || "").trim() || undefined,
          phone: String(fd.get("phone") || "").trim(),
          address: String(fd.get("address") || "").trim(),
          city: String(fd.get("city") || "").trim(),
          province_code: String(fd.get("province_code") || "").trim() || undefined,
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
      setSuccess({ order_id: data.order_id });
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <div className="max-w-5xl mx-auto p-6">Loading checkout…</div>;
  if (!lines.length) return <div className="max-w-5xl mx-auto p-6">Your cart is empty.</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
      {/* Left: Items and address */}
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Checkout</h1>

        {/* Items list */}
        <div className="border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Item</th>
                <th className="text-left p-3">Variant</th>
                <th className="text-right p-3">Unit Price</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-right p-3">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => {
                const v = variants[ln.variant_id];
                const variantText = [v?.color, v?.size, v?.pack].filter(Boolean).join(" / ") || v?.sku;
                const lineTotal = (v?.price || 0) * ln.qty;
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-medium whitespace-nowrap">{v?.sku || ln.variant_id.slice(0, 8)}</td>
                    <td className="p-3 text-gray-600">{variantText}</td>
                    <td className="p-3 text-right">PKR {Number(v?.price || 0).toLocaleString()}</td>
                    <td className="p-3 text-right">{ln.qty}</td>
                    <td className="p-3 text-right">PKR {Number(lineTotal).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Address & payment */}
        {success ? (
          <div className="border rounded p-4 bg-green-50 text-green-800">
            Order placed! Your order id is <span className="font-semibold">#{success.order_id}</span>.
          </div>
        ) : (
          <form ref={formRef} onSubmit={handlePlaceOrder} className="grid grid-cols-1 gap-4">
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

      {/* Right: Summary */}
      <aside className="lg:sticky lg:top-6">
        <div className="border rounded p-4 space-y-3">
          <h2 className="font-medium">Order Summary</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Items subtotal</span>
            <span>PKR {Number(subtotal).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Shipping</span>
            <span>Calculated after address</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between font-semibold">
            <span>Total</span>
            <span>PKR {Number(subtotal).toLocaleString()}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
