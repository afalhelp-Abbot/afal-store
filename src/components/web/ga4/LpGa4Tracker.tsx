"use client";

import { useEffect } from "react";
import { computeEffectiveGaId, ga4Event, type Ga4GlobalConfig, type Ga4ProductOverride } from "@/lib/ga4";

type VariantInfo = {
  id: string;
  sku: string | null;
  price: number | null;
  color?: string;
  size?: string;
  model?: string;
  pack?: string;
};

type Props = {
  globalGa: Ga4GlobalConfig | null;
  productGa: Ga4ProductOverride | null;
  product: { id: string; slug: string; name: string };
  variants: VariantInfo[];
};

export default function LpGa4Tracker({ globalGa, productGa, product, variants }: Props) {
  useEffect(() => {
    const id = computeEffectiveGaId(globalGa, productGa);
    if (!id) return;

    const page_location = typeof window !== "undefined" ? window.location.href : undefined;
    const page_path = typeof window !== "undefined" ? window.location.pathname : undefined;

    ga4Event(id, "page_view", { page_location, page_path });

    const items = variants.map((v) => ({
      item_id: v.sku || v.id,
      item_name: product.name,
      item_variant: [v.color, v.size, v.model, v.pack].filter(Boolean).join(" / ") || undefined,
      price: v.price != null ? Number(v.price) : undefined,
    }));

    ga4Event(id, "lp_view", {
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      items,
    });
  }, [globalGa, productGa, product.id, product.slug, product.name, variants]);

  return null;
}
