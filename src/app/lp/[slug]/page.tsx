import { getSupabaseServerClient } from '@/lib/supabaseServer';
import BuyPanel from '@/components/web/landing/BuyPanel';
import Image from 'next/image';
import UTMCapture from '@/components/web/landing/UTMCapture';

async function fetchLpData(slug: string) {
  const supabase = getSupabaseServerClient();
  // 1) Product by slug
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug, description')
    .eq('slug', slug)
    .maybeSingle();
  if (!product?.id) return null;

  // 2) Active variants (id, sku, price)
  const { data: variants } = await supabase
    .from('variants')
    .select('id, sku, price, active')
    .eq('product_id', product.id)
    .eq('active', true)
    .order('price', { ascending: true });

  // 3) Inventory for availability
  const { data: inv } = await supabase
    .from('inventory')
    .select('variant_id, stock_on_hand, reserved');

  const availabilityByVariant: Record<string, number> = {};
  for (const row of inv ?? []) {
    const vId = (row as any).variant_id as string;
    const on = Number((row as any).stock_on_hand) || 0;
    const res = Number((row as any).reserved) || 0;
    availabilityByVariant[vId] = on - res;
  }

  // 4) Map variant -> Color name
  const { data: colorType } = await supabase
    .from('option_types')
    .select('id')
    .eq('name', 'Color')
    .maybeSingle();
  const colorTypeId = colorType?.id as string | undefined;

  const variantIds = (variants ?? []).map((v: any) => v.id);
  let colorByVariant: Record<string, string> = {};
  if (colorTypeId && variantIds.length) {
    const { data: mapping } = await supabase
      .from('variant_option_values')
      .select('variant_id, option_values(value, option_type_id)')
      .in('variant_id', variantIds)
      .eq('option_values.option_type_id', colorTypeId);
    for (const row of mapping ?? []) {
      const value = (row as any).option_values?.value as string | undefined;
      if (value) colorByVariant[(row as any).variant_id as string] = value;
    }
  }

  // 5) Aggregate per color
  const colorPrices: Record<string, number> = {};
  const colorAvailability: Record<string, number> = {};
  const colorVariantId: Record<string, string> = {};
  for (const v of variants ?? []) {
    const id = (v as any).id as string;
    const price = Number((v as any).price);
    const color = colorByVariant[id] ?? ((((v as any).sku || '').split('-')[1]) || 'Default');
    // pick the lowest price per color and remember that variant id
    if (!(color in colorPrices) || price < colorPrices[color]) {
      colorPrices[color] = price;
      colorVariantId[color] = id;
    }
    colorAvailability[color] = (colorAvailability[color] ?? 0) + (availabilityByVariant[id] ?? 0);
  }

  const startingPrice = Object.values(colorPrices).sort((a, b) => a - b)[0] ?? null;

  return {
    product,
    variants: variants ?? [],
    startingPrice,
    colorPrices,
    colorAvailability,
    colorVariantId,
  } as const;
}

export default async function LandingPage({ params }: { params: { slug: string } }) {
  const data = await fetchLpData(params.slug);
  if (!data) {
    return <div className="p-6">Landing page not found.</div>;
  }

  const { product, startingPrice, colorPrices, colorAvailability, colorVariantId } = data;

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
      <UTMCapture />
      {/* Left: Content blocks (placeholder for now; Step 3 will enrich) */}
      <div className="lg:col-span-2 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">{product.name}</h1>
          <p className="text-gray-600">Official Google Find My Device compatible tracker.</p>
        </header>

        {/* Media Gallery (using images already in project public/images) */}
        <section className="space-y-3">
          <div className="relative aspect-video w-full rounded overflow-hidden bg-gray-100">
            <Image
              src="/images/2c6e7458128b076e82bd99f52ab130c8.avif"
              alt={`${product.name} hero`}
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              '/images/94caacfb5a2c869439a89646703d75bb.avif',
              '/images/3c03271147d6f8062d3cdbea740aee99.avif',
              '/images/8f2cf7b23a638f499313f6fbf6bd4087.avif',
              '/images/8227e60d14e5f9f681bd580a6671b3c5.avif',
              '/images/cad05795ed848d2c89cb4b7b53970f4c.avif',
              '/images/d3d9555482ccfc3130698b9400c07518.avif',
              '/images/ab848a78a9c626e6cb937806b8c8fbfd.avif',
            ].map((src) => (
              <div key={src} className="relative aspect-square rounded overflow-hidden bg-gray-100">
                <Image src={src} alt={`${product.name} image`} fill className="object-cover" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-medium mb-2">Highlights</h2>
          <ul className="list-disc pl-6 text-sm text-gray-700 space-y-1">
            <li>Real-time tracking with Google Find My Device</li>
            <li>IP68 waterproof, ultra-slim design</li>
            <li>1-year battery life with replaceable coin cell</li>
            <li>Loud buzzer for quick finding</li>
            <li>Two-way finding to locate phone or tag</li>
          </ul>
        </section>

        {/* Bilingual Description */}
        <section className="space-y-6">
          <div className="prose max-w-none">
            <p>Never lose what matters again — the 2025 Android Tag keeps your world safe.</p>
            <p>Attach it to keys, bags, wallets, or even pets, and track them instantly.</p>
            <p>Open the Google Find My Device app to see live location anytime, anywhere.</p>
            <p>Nearby? Make the Tag ring loudly and follow the sound straight to your item.</p>
            <p>Far away? The global Android network helps you locate it securely on the map.</p>
            <p>Get separation alerts so you’ll never leave your essentials behind.</p>
            <p>With long-lasting replaceable battery, it protects you for months without charging.</p>
            <p>Designed with water and dust resistance (IP67) — ready for rain, travel, and daily life.</p>
            <p>Compact, durable, and stylish enough to carry anywhere with confidence.</p>
            <p><strong>Android Tag — precision, protection, and peace of mind in your pocket.</strong></p>
          </div>

          <div className="prose max-w-none font-urdu" dir="rtl">
            <p>اب قیمتی چیزوں کا کھو جانا قصۂ ماضی! نیا 2025 Android Tag آپ کے لئے سکون کی ضمانت۔</p>
            <p>چابیاں، بیگ، بٹوا یا پالتو — سب پر لگائیں اور لمحوں میں ڈھونڈ نکالیں۔</p>
            <p>بس Google Find My Device ایپ کھولیں اور نقشے پر جگہ فوراً دیکھیں۔</p>
            <p>قریب ہوں تو Tag بجائیں اور آواز کے ساتھ سیدھا پہنچ جائیں۔</p>
            <p>اگر دور کھو جائے تو Android نیٹ ورک آپ کو نقشے پر راستہ دکھائے۔</p>
            <p>Separation Alerts آپ کو وقت پر خبردار کریں تاکہ کچھ پیچھے نہ رہ جائے۔</p>
            <p>لمبی عمر والی replaceable battery مہینوں تک حفاظت فراہم کرے۔</p>
            <p>IP67 پانی اور دھول سے محفوظ ڈیزائن سفر اور روزمرہ زندگی کے لئے بہترین۔</p>
            <p>چھوٹا، مضبوط اور دلکش ڈیزائن — ہر جگہ ساتھ رکھنے کے قابل۔</p>
            <p><strong>Android Tag — حفاظت، سہولت اور اطمینان آپ کی جیب میں۔</strong></p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-medium mb-2">Specifications</h2>
          <table className="w-full text-sm text-gray-700">
            <tbody>
              <tr className="border-b"><td className="py-2 pr-4 font-medium">Type</td><td className="py-2">Bluetooth tracker</td></tr>
              <tr className="border-b"><td className="py-2 pr-4 font-medium">Bluetooth</td><td className="py-2">BLE</td></tr>
              <tr className="border-b"><td className="py-2 pr-4 font-medium">Battery</td><td className="py-2">CR2032 coin cell (replaceable)</td></tr>
              <tr className="border-b"><td className="py-2 pr-4 font-medium">Waterproof</td><td className="py-2">IP68</td></tr>
              <tr className="border-b"><td className="py-2 pr-4 font-medium">Compatibility</td><td className="py-2">Android (Google Find My Device)</td></tr>
              <tr className="border-b"><td className="py-2 pr-4 font-medium">Features</td><td className="py-2">Real-time tracking, loud buzzer, two-way finding</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      {/* Right: Sticky Buy panel */}
      <aside className="lg:col-span-1">
        <div className="lg:sticky lg:top-6">
          <BuyPanel
            startingPrice={startingPrice}
            colorPrices={colorPrices}
            colorAvailability={colorAvailability}
            colorVariantId={colorVariantId}
          />
        </div>
      </aside>
    </div>
  );
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = getSupabaseServerClient();
  const { data: product } = await supabase
    .from('products')
    .select('name, description')
    .eq('slug', params.slug)
    .maybeSingle();
  const title = product?.name ? `${product.name} – Afal Store` : 'Afal Store';
  const description = product?.description || 'Premium Android Tag compatible with Google Find My Device. Waterproof, long battery, compact.';
  const ogImage = '/images/2c6e7458128b076e82bd99f52ab130c8.avif';
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  } as const;
}
