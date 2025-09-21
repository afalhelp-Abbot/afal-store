import HomePresenter from '@/components/web/presenters/HomePresenter';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export default async function HomeServerContainer() {
  const supabase = getSupabaseServerClient();

  // 1) Get product id by slug
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('slug', 'air-tag')
    .maybeSingle();
  if (!product?.id) {
    return <HomePresenter startingPrice={null} colorPrices={{}} colorAvailability={{}} />;
  }

  // 2) Get active variants and their prices
  const { data: variants, error: variantsError } = await supabase
    .from('variants')
    .select('id, price')
    .eq('product_id', product.id)
    .eq('active', true);
  if (variantsError || !variants?.length) {
    return <HomePresenter startingPrice={null} colorPrices={{}} colorAvailability={{}} />;
  }

  // 3) Get inventory and compute availability per variant
  const { data: inv } = await supabase
    .from('inventory')
    .select('variant_id, stock_on_hand, reserved');
  const availabilityByVariant: Record<string, number> = {};
  for (const row of inv ?? []) {
    availabilityByVariant[(row as any).variant_id] = Number((row as any).stock_on_hand) - Number((row as any).reserved);
  }

  // 4) Get Color option type id and mapping of variant -> color name
  const { data: colorType } = await supabase
    .from('option_types')
    .select('id')
    .eq('name', 'Color')
    .maybeSingle();
  const colorTypeId = colorType?.id as string | undefined;

  let colorPrices: Record<string, number> = {};
  let colorAvailability: Record<string, number> = {};

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
      // Price per color (variant)
      colorPrices[color] = Number(variant.price);
      // Availability per color (aggregate if multiple variants share same color)
      const avail = availabilityByVariant[variantId] ?? 0;
      colorAvailability[color] = (colorAvailability[color] ?? 0) + avail;
    }
  }

  // 5) Fallbacks
  const startingPrice = variants
    .map((v: any) => Number(v.price))
    .sort((a, b) => a - b)[0] ?? null;

  return (
    <HomePresenter
      startingPrice={startingPrice}
      colorPrices={colorPrices}
      colorAvailability={colorAvailability}
    />
  );
}
