import { getSupabaseServerClient } from '@/lib/supabaseServer';
import ImageGallery, { type MediaItem } from '@/components/web/product/ImageGallery';
// Local media for the Air Tag product
import img1 from '../../../../Images/8.avif';
import img2 from '../../../../Images/9.avif';
import img3 from '../../../../Images/13.avif';
import img4 from '../../../../Images/10.avif';
import img5 from '../../../../Images/12.avif';
import img6 from '../../../../Images/11.avif';
import img7 from '../../../../Images/14.avif';
import img8 from '../../../../Images/15.avif';
import img9 from '../../../../Images/16.avif';
import img10 from '../../../../Images/17.avif';

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
  const media: MediaItem[] = [
    { type: 'video', src: '/Images/Android%20Version.mp4', poster: img1, alt: 'Product demo video' },
    { type: 'image', src: img1, alt: 'Hero image' },
    { type: 'image', src: img2 },
    { type: 'image', src: img3 },
    { type: 'image', src: img4 },
    { type: 'image', src: img5 },
    { type: 'image', src: img6 },
    { type: 'image', src: img7 },
    { type: 'image', src: img8 },
    { type: 'image', src: img9 },
    { type: 'image', src: img10 },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{product.name}</h1>
        <p className="text-gray-600">Android-compatible Bluetooth tracker</p>
      </header>

      <section className="grid md:grid-cols-[680px_1fr] gap-10 items-start">
        <ImageGallery items={media} />
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

      <section className="prose max-w-none prose-h2:text-2xl prose-h2:font-semibold prose-h3:text-xl prose-h3:font-semibold">
        <h2 className="text-3xl font-semibold mt-6">Product Highlights</h2>
        <ul className="mt-4 space-y-2">
          <li><strong>Google Certified Smart Tracker</strong> – AFAL’s Android Tag connects seamlessly with Android devices (not for iOS) through the Google Find My Device app. Attach it to keys, wallets, backpacks, or suitcases.</li>
          <li><strong>Global Tracking Power</strong> – Within <strong>80 feet</strong> Bluetooth range, make it ring with its built-in speaker and follow the sound. Out of range? Instantly see its last or live location on the map, anywhere in the world.</li>
          <li><strong>Smart Alerts & Left-Behind Reminders</strong> – Get instant notifications if you leave something behind. Open the free Find My Device app (no subscriptions) and see your tag’s recent location.</li>
          <li><strong>Share Access with Others</strong> – Allow up to 5 trusted people to view the item’s location. Perfect for family, friends, or team use.</li>
          <li><strong>Lost Mode Superpower</strong> – Activate Lost Mode and let Google’s vast network help you find it. If detected by any nearby Google device, you’ll receive an automatic alert.</li>
          <li><strong>Durable & Waterproof (IP66)</strong> – Built tough to withstand splashes, heavy rain, and short submersion. Reliable for daily life, travel, and outdoor adventures.</li>
          <li><strong>Privacy You Can Trust</strong> – Protected by Google’s encrypted and anonymous network. Location history is never stored.</li>
        </ul>

        <h3 className="text-2xl font-semibold mt-10">خصوصیات</h3>
        <ul className="mt-4 space-y-2">
          <li><strong>گوگل تصدیق شدہ اسمارٹ ٹریکر</strong> – AFAL کا Android Tag صرف Android ڈیوائسز کے ساتھ Google Find My Device ایپ پر کام کرتا ہے۔ اسے چابیوں، بٹوے، بیگ یا سوٹ کیس پر لگائیں۔</li>
          <li><strong>عالمی ٹریکنگ پاور</strong> – اگر چیز <strong>80 فٹ</strong> بلوٹوتھ رینج میں ہے تو ٹریکر کو بجائیں اور آواز کے پیچھے چلیں۔ رینج سے باہر ہو تو دنیا کے کسی بھی کونے میں اس کی جگہ فوراً نقشے پر دیکھیں۔</li>
          <li><strong>سمارٹ الرٹس اور لیفٹ بی ہائنڈ ریمائنڈرز</strong> – کوئی چیز پیچھے رہ جائے تو فوری اطلاع ملے۔ مفت Find My Device ایپ میں حالیہ لوکیشن دیکھیں (کوئی سبسکرپشن نہیں)۔</li>
          <li><strong>شیئرنگ فیچر</strong> – مقام 5 افراد تک کے ساتھ شیئر کریں تاکہ وہ بھی نقشے پر دیکھ سکیں۔</li>
          <li><strong>لاسٹ موڈ</strong> – چیز کھو جائے تو Lost Mode آن کریں؛ قریب سے گزرنے والی گوگل ڈیوائس ملنے پر اطلاع ملے گی۔</li>
          <li><strong>واٹر پروف اور مضبوط (IP66)</strong> – بارش، چھینٹوں اور مختصر ڈوبنے سے محفوظ؛ سفر اور روزمرہ استعمال کے لیے موزوں۔</li>
          <li><strong>پرائیویسی کی ضمانت</strong> – گوگل کا انکرپٹڈ اور محفوظ نیٹ ورک؛ لوکیشن ہسٹری محفوظ نہیں ہوتی۔</li>
        </ul>

        <h2 className="text-3xl font-semibold mt-12">Key Specifications</h2>
        <table className="mt-4 w-full table-auto border-separate border-spacing-x-4 border-spacing-y-2">
          <tbody>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Model</td><td className="align-top">Wireless tag</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Product</td><td className="align-top">Find My locator</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">App</td><td className="align-top">Google Find My Device</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Battery</td><td className="align-top">CR2032 button cell, ~210 mAh (user-replaceable)</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Waterproof</td><td className="align-top">IP66 (splash/rain resistant)</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">OS</td><td className="align-top">Android</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Material</td><td className="align-top">ABS (plastic)</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Product Size</td><td className="align-top">Φ32 mm × 7.9 mm</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Product Weight</td><td className="align-top">6.6 g</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Colors</td><td className="align-top">Black, White, Pink, Teal</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Speaker</td><td className="align-top">Built‑in buzzer (≈60–70 dB)</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Functions</td><td className="align-top">Works with Google Find My Device, Lost Mode, Left‑behind alerts, Share with up to 5 people</td></tr>
          </tbody>
        </table>

        <h2 className="text-3xl font-semibold mt-12">Packaging & Delivery</h2>
        <table className="mt-4 w-full table-auto border-separate border-spacing-x-4 border-spacing-y-2">
          <tbody>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Selling Units</td><td className="align-top">Single item</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Single Package Size</td><td className="align-top">8 × 8 × 3 cm</td></tr>
            <tr><td className="whitespace-nowrap text-gray-800 font-semibold align-top w-48">Single Gross Weight</td><td className="align-top">0.040 kg</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
