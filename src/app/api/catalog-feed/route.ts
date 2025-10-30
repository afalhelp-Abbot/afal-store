import { NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const site = 'https://afalstore.com';
    const supabase = getSupabaseServerClient();

    const { data: products } = await supabase
      .from('products')
      .select('id, name, slug, description_en, active')
      .eq('active', true);

    const productIds = (products ?? []).map((p: any) => p.id);
    const { data: variants } = await supabase
      .from('variants')
      .select('id, product_id, sku, price, active, thumb_url')
      .in('product_id', productIds.length ? productIds : ['_'])
      .eq('active', true);

    const variantIds = (variants ?? []).map((v: any) => v.id);
    const { data: inventory } = await supabase
      .from('inventory')
      .select('variant_id, stock_on_hand, reserved')
      .in('variant_id', variantIds.length ? variantIds : ['_']);

    const { data: media } = await supabase
      .from('product_media')
      .select('product_id, type, url, sort')
      .in('product_id', productIds.length ? productIds : ['_'])
      .order('sort', { ascending: true });

    const invMap: Record<string, { on: number; res: number }> = {};
    for (const row of inventory ?? []) {
      invMap[(row as any).variant_id] = {
        on: Number((row as any).stock_on_hand || 0),
        res: Number((row as any).reserved || 0),
      };
    }

    const firstImageByProduct: Record<string, string | undefined> = {};
    for (const m of media ?? []) {
      if ((m as any).type !== 'image') continue;
      const pid = (m as any).product_id as string;
      if (!firstImageByProduct[pid]) firstImageByProduct[pid] = (m as any).url as string;
    }

    const prodById = Object.fromEntries((products ?? []).map((p: any) => [p.id, p]));

    const rows: string[] = [];
    const pushRow = (arr: (string | number)[]) => {
      const esc = (val: any) => {
        const s = String(val ?? '');
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      rows.push(arr.map(esc).join(','));
    };

    pushRow(['id','title','description','price','availability','link','image_link','brand','condition']);

    for (const v of (variants ?? [])) {
      const vid = (v as any).id as string;
      const pid = (v as any).product_id as string;
      const sku = (v as any).sku as string;
      const price = Number((v as any).price || 0);
      const p = prodById[pid];
      if (!p) continue;
      const availRaw = invMap[vid];
      const available = ((availRaw?.on || 0) - (availRaw?.res || 0)) > 0;
      const availability = available ? 'in stock' : 'out of stock';
      const link = `${site}/lp/${p.slug}?utm_source=facebook&utm_medium=ads&utm_campaign=catalog&utm_content=${encodeURIComponent(sku)}`;
      const image = (v as any).thumb_url || firstImageByProduct[pid] || '';

      // Best-effort color naming from SKU suffix map used in your project
      const colorMap: Record<string, string> = { W01: 'White', B01: 'Black', T01: 'Teal', P01: 'Pink' };
      const color = colorMap[sku] || undefined;
      const title = color ? `${p.name} (${color})` : p.name;
      const description = p.description_en || '';

      pushRow([
        sku,
        title,
        description,
        `${price} PKR`,
        availability,
        link,
        image,
        'AFAL',
        'new',
      ]);
    }

    const csv = rows.join('\n') + '\n';
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err: any) {
    return new Response(`Error: ${err?.message || 'Unable to build feed'}`, { status: 500 });
  }
}
