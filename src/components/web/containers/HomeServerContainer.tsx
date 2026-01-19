import HomePresenter from '@/components/web/presenters/HomePresenter';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export default async function HomeServerContainer() {
  const supabase = getSupabaseServerClient();

  // Featured/primary product for hero (fallback to first active product)
  const { data: primary } = await supabase
    .from('products')
    .select('id, slug, logo_url, fb_page_url, contact_email')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let startingPrice: number | null = null;
  let colorPrices: Record<string, number> = {};
  let colorAvailability: Record<string, number> = {};
  const primaryLogoUrl = (primary as any)?.logo_url as string | null | undefined;
  const primaryFbPageUrl = (primary as any)?.fb_page_url as string | null | undefined;
  const primaryContactEmail = (primary as any)?.contact_email as string | null | undefined;

  if (primary?.id) {
    const { data: variants } = await supabase
      .from('variants')
      .select('id, price')
      .eq('product_id', primary.id)
      .eq('active', true);
    if (variants && variants.length) {
      // Inventory availability
      const { data: inv } = await supabase
        .from('inventory')
        .select('variant_id, stock_on_hand, reserved');
      const availabilityByVariant: Record<string, number> = {};
      for (const row of inv ?? []) {
        availabilityByVariant[(row as any).variant_id] = Number((row as any).stock_on_hand) - Number((row as any).reserved);
      }
      // Color mapping
      const { data: colorType } = await supabase
        .from('option_types')
        .select('id')
        .eq('name', 'Color')
        .maybeSingle();
      const colorTypeId = colorType?.id as string | undefined;
      if (colorTypeId) {
        const variantIds = variants.map((v: any) => v.id);
        const { data: mapping } = await supabase
          .from('variant_option_values')
          .select('variant_id, option_values(value, option_type_id)')
          .in('variant_id', variantIds)
          .eq('option_values.option_type_id', colorTypeId);
        for (const row of mapping ?? []) {
          const optionValues = (row as any).option_values;
          const color = String(optionValues?.value || '').trim();
          const variantId = (row as any).variant_id as string;
          const variant = (variants as any[]).find((x) => x.id === variantId);
          if (!color || !variant) continue;
          colorPrices[color] = Number(variant.price);
          const avail = availabilityByVariant[variantId] ?? 0;
          colorAvailability[color] = (colorAvailability[color] ?? 0) + avail;
        }
      }
      startingPrice = variants.map((v: any) => Number(v.price)).sort((a, b) => a - b)[0] ?? null;
    }
  }

  // Build products list for grid (scalable).
  // Prefer explicit featured_rank ordering when available, otherwise newest first.
  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, featured_rank, created_at')
    .eq('active', true)
    .order('featured_rank', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  let productCards: { id: string; name: string; slug: string; fromPrice: number | null; image: string | null }[] = [];
  for (const p of products ?? []) {
    const pid = (p as any).id as string;
    const slug = (p as any).slug as string;
    const name = (p as any).name as string;
    const { data: pv } = await supabase
      .from('variants')
      .select('price, active')
      .eq('product_id', pid)
      .eq('active', true)
      .order('price', { ascending: true })
      .limit(1);
    const fromPrice = (pv && pv.length) ? Number((pv[0] as any).price) : null;
    const { data: media } = await supabase
      .from('product_media')
      .select('url, type, sort')
      .eq('product_id', pid)
      .eq('type', 'image')
      .order('sort', { ascending: true })
      .limit(1);
    const image = (media && media.length) ? (media[0] as any).url as string : null;
    productCards.push({ id: pid, name, slug, fromPrice, image });
  }

  const activeProductsCount = productCards.length;
  const singleProductSlug = activeProductsCount === 1 ? productCards[0]?.slug ?? null : null;

  return (
    <HomePresenter
      startingPrice={startingPrice}
      colorPrices={colorPrices}
      colorAvailability={colorAvailability}
      products={productCards}
      logoUrl={primaryLogoUrl ?? null}
      contactEmail={primaryContactEmail ?? null}
      fbPageUrl={primaryFbPageUrl ?? null}
      activeProductsCount={activeProductsCount}
      singleProductSlug={singleProductSlug}
    />
  );
}
