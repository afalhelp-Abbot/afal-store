import { getSupabaseServerClient } from '@/lib/supabaseServer';

async function getProduct() {
  const supabase = getSupabaseServerClient();
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug, description')
    .eq('slug', 'air-tag')
    .maybeSingle();
  if (!product) return null;

  const { data: variants } = await supabase
    .from('variants')
    .select('id, sku, price, active')
    .eq('product_id', product.id)
    .eq('active', true)
    .order('sku');

  const { data: inventory } = await supabase
    .from('inventory')
    .select('variant_id, stock_on_hand, reserved');

  // Map availability
  const byId: Record<string, { on: number; res: number }> = {};
  for (const row of inventory ?? []) {
    byId[row.variant_id] = { on: row.stock_on_hand, res: row.reserved };
  }

  const enriched = (variants ?? []).map((v) => {
    const inv = byId[v.id] || { on: 0, res: 0 };
    const available = inv.on - inv.res;
    return { ...v, available };
  });

  // Get color mapping
  const { data: mapping } = await getVariantColors(product.id);

  return { product, variants: enriched, colors: mapping };
}

async function getVariantColors(productId: string) {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from('variant_option_values')
    .select('variant_id, option_values(value, option_type_id)')
    .in('variant_id', (
      await supabase.from('variants').select('id').eq('product_id', productId)
    ).data?.map((v: any) => v.id) || []);
  const colors: Record<string, string> = {};
  for (const row of data ?? []) {
    const value = (row as any).option_values?.value;
    if (value) colors[(row as any).variant_id] = value;
  }
  return { data: colors };
}

export default async function AirTagPage() {
  const result = await getProduct();
  if (!result) return <div className="p-6">Product not found.</div>;
  const { product, variants, colors } = result;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{product.name}</h1>
        <p className="text-gray-600">Android-compatible Bluetooth tracker</p>
      </header>

      <section className="grid md:grid-cols-2 gap-8 items-start">
        <div className="aspect-square w-full bg-gray-100 rounded" />
        <div className="space-y-4">
          <p className="text-sm text-gray-700">Choose Color</p>
          <div className="grid grid-cols-2 gap-3">
            {variants.map((v) => {
              const color = colors[v.id] ?? v.sku.split('-')[1];
              const disabled = v.available <= 0;
              return (
                <button
                  key={v.sku}
                  disabled={disabled}
                  className={`border rounded px-3 py-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={disabled ? 'Out of stock' : ''}
                >
                  <div className="flex items-center justify-between">
                    <span>{color}</span>
                    <span className="text-sm text-gray-600">{Number(v.price).toLocaleString()} PKR</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {disabled ? 'Out of stock' : `${v.available} available`}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="pt-4 text-sm text-gray-600">
            Cash on Delivery available in Pakistan. Shipping in 24–48 hours after confirmation.
          </div>
        </div>
      </section>

      <section className="prose max-w-none">
        <h2>Features</h2>
        <ul>
          <li>Loud buzzer for easy finding</li>
          <li>User-replaceable coin cell battery</li>
          <li>Compact and lightweight</li>
        </ul>
      </section>
    </div>
  );
}
