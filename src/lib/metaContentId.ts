export type ContentIdSource = "sku" | "variant_id";

export function getMetaContentId(
  variant: { id?: string | null; sku?: string | null },
  source: ContentIdSource,
): string {
  if (source === "variant_id") {
    return String(variant.id ?? "");
  }
  return String(variant.sku ?? variant.id ?? "");
}
