"use client";
import React, { useEffect } from "react";
import { ensurePixel, track } from "@/lib/pixel";
import { getMetaContentId } from "@/lib/metaContentId";

export type PixelConfig = {
  enabled: boolean;
  pixel_id: string | null;
  content_id_source: "sku" | "variant_id";
  events?: { view_content?: boolean };
};

type Props = {
  productId: string;
  productName: string;
  variants: Array<{ id: string; sku: string; price: number }>;
  config: PixelConfig | null;
};

export default function LPViewPixel({ productId, productName, variants, config }: Props) {
  useEffect(() => {
    if (!config || !config.enabled || !config.pixel_id) {
      return;
    }
    if (config.events && config.events.view_content === false) {
      return;
    }
    const ok = ensurePixel(config.pixel_id);
    if (!ok) return;
    const ids = variants
      .map((v) => getMetaContentId({ id: v.id, sku: v.sku }, config.content_id_source))
      .filter(Boolean);
    const minPrice = variants.reduce((m, v) => Math.min(m, Number(v.price) || Infinity), Infinity);
    const value = Number.isFinite(minPrice) ? minPrice : undefined;
    track("PageView");
    track("ViewContent", {
      content_ids: ids.slice(0, 20),
      content_type: "product",
      content_name: productName,
      value,
      currency: "PKR",
    });
  }, [productId, productName, config, variants]);
  return null;
}
