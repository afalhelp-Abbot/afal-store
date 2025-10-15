import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// Google Merchant XML feed (RSS 2.0 with g: namespace)
export async function GET() {
  const site = 'https://afalstore.com';
  const supabase = getSupabaseServerClient();

  // Load active products
  const { data: products } = await supabase
    .from('products')
    .select('id, slug, name, description_en, active')
    .eq('active', true);

  const items: Array<{
    id: string;
    slug: string;
    title: string;
    description: string;
    image: string | null;
    price: number | null;
    availability: 'in stock' | 'out of stock';
  }> = [];

  for (const p of products || []) {
    const pid = (p as any).id as string;
    const slug = (p as any).slug as string;

    // First image
    const { data: media } = await supabase
      .from('product_media')
      .select('type, url, sort')
      .eq('product_id', pid)
      .order('sort', { ascending: true });
    const firstImg = (media || []).find((m: any) => m.type === 'image');

    // Lowest active variant price
    const { data: variants } = await supabase
      .from('variants')
      .select('id, price, active')
      .eq('product_id', pid)
      .eq('active', true);
    const lowest = (variants || []).reduce((min: number, v: any) => Math.min(min, Number(v.price || Infinity)), Infinity);

    // Availability = sum(on_hand - reserved) across variants > 0?
    const variantIds = (variants || []).map((v: any) => v.id);
    let availability: 'in stock' | 'out of stock' = 'out of stock';
    if (variantIds.length) {
      const { data: inv } = await supabase
        .from('inventory')
        .select('variant_id, stock_on_hand, reserved')
        .in('variant_id', variantIds);
      const totalAvail = (inv || []).reduce((s: number, r: any) => s + (Number(r.stock_on_hand || 0) - Number(r.reserved || 0)), 0);
      availability = totalAvail > 0 ? 'in stock' : 'out of stock';
    }

    items.push({
      id: pid,
      slug,
      title: (p as any).name as string,
      description: ((p as any).description_en as string) || '',
      image: firstImg?.url || null,
      price: Number.isFinite(lowest) ? lowest : null,
      availability,
    });
  }

  // Build XML
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xmlItems = items.map((it) => `
    <item>
      <g:id>${esc(it.id)}</g:id>
      <title>${esc(it.title || '')}</title>
      <description>${esc((it.description || '').slice(0, 5000))}</description>
      <link>${esc(`${site}/lp/${it.slug}`)}</link>
      ${it.image ? `<g:image_link>${esc(it.image)}</g:image_link>` : ''}
      <g:availability>${it.availability}</g:availability>
      ${it.price != null ? `<g:price>${Number(it.price).toFixed(2)} PKR</g:price>` : ''}
      <g:condition>new</g:condition>
      <g:brand>Afal</g:brand>
      <g:identifier_exists>false</g:identifier_exists>
    </item>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Afal Store</title>
    <link>${site}</link>
    <description>Afal Store product feed (Pakistan)</description>
${xmlItems}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
