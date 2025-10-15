"use client";

import React, { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export type ProductPixelConfig = {
  product_id: string;
  enabled: boolean;
  pixel_id: string | null;
  content_id_source: "sku" | "variant_id";
  events: {
    view_content?: boolean;
    initiate_checkout?: boolean;
    add_payment_info?: boolean;
    purchase?: boolean;
  };
};

type Props = {
  productId: string;
  open: boolean;
  onClose: () => void;
};

export default function ProductMetaPixelModal({ productId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState<boolean>(false);
  const [pixelId, setPixelId] = useState<string>("");
  const [contentIdSource, setContentIdSource] = useState<"sku" | "variant_id">("sku");
  const [events, setEvents] = useState<ProductPixelConfig["events"]>({ view_content: true });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabaseBrowser
          .from("product_pixel")
          .select("product_id, enabled, pixel_id, content_id_source, events")
          .eq("product_id", productId)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setEnabled(Boolean((data as any).enabled));
          setPixelId(String((data as any).pixel_id || ""));
          setContentIdSource(((data as any).content_id_source as any) === "variant_id" ? "variant_id" : "sku");
          const ev = (data as any).events || {};
          setEvents({
            view_content: Boolean(ev.view_content ?? true),
            initiate_checkout: Boolean(ev.initiate_checkout ?? false),
            add_payment_info: Boolean(ev.add_payment_info ?? false),
            purchase: Boolean(ev.purchase ?? false),
          });
        } else {
          // defaults
          setEnabled(false);
          setPixelId("");
          setContentIdSource("sku");
          setEvents({ view_content: true });
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load Meta Pixel settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, productId]);

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const payload = {
        product_id: productId,
        enabled,
        pixel_id: pixelId || null,
        content_id_source: contentIdSource,
        events,
      } as any;
      const { error } = await supabaseBrowser
        .from("product_pixel")
        .upsert(payload, { onConflict: "product_id" });
      if (error) throw error;
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save Meta Pixel settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleEvent = (k: keyof ProductPixelConfig["events"]) =>
    setEvents((prev) => ({ ...prev, [k]: !prev[k] }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={() => !saving && onClose()} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl p-6 overflow-y-auto rounded-l-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Meta Pixel</h2>
          <button className="text-gray-500 hover:text-gray-700" onClick={() => !saving && onClose()}>✕</button>
        </div>
        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
        )}
        {loading ? (
          <div>Loading…</div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <input id="mp-enabled" type="checkbox" checked={enabled} onChange={(e)=>setEnabled(e.target.checked)} />
              <label htmlFor="mp-enabled" className="font-medium">Enable for this product</label>
            </div>

            <div>
              <label className="block text-sm font-medium">Pixel ID</label>
              <input
                value={pixelId}
                onChange={(e)=>setPixelId(e.target.value)}
                placeholder="e.g. 123456789012345"
                className="mt-1 border rounded px-3 py-2 w-full"
              />
              <p className="text-xs text-gray-600 mt-1">Optional per-product override. If left empty, no pixel will fire unless a global fallback is added later.</p>
            </div>

            <div>
              <label className="block text-sm font-medium">content_ids source</label>
              <select
                className="mt-1 border rounded px-3 py-2"
                value={contentIdSource}
                onChange={(e)=> setContentIdSource(e.target.value as any)}
              >
                <option value="sku">SKU</option>
                <option value="variant_id">Variant ID</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Events</label>
              <div className="mt-1 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!events.view_content} onChange={()=>toggleEvent("view_content")} />
                  ViewContent (LP view)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!events.initiate_checkout} onChange={()=>toggleEvent("initiate_checkout")} />
                  InitiateCheckout (checkout page)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!events.add_payment_info} onChange={()=>toggleEvent("add_payment_info")} />
                  AddPaymentInfo (before placing order)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!events.purchase} onChange={()=>toggleEvent("purchase")} />
                  Purchase (thank-you)
                </label>
                <p className="text-xs text-gray-600">Purchase value will exclude shipping.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded border">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
