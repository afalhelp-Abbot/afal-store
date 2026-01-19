import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProductsIndexPage() {
  const supabase = getSupabaseServerClient();

  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug')
    .eq('active', true)
    .order('created_at', { ascending: false });

  const cards: { id: string; name: string; slug: string; fromPrice: number | null; image: string | null }[] = [];

  for (const p of products ?? []) {
    const pid = (p as any).id as string;
    const name = (p as any).name as string;
    const slug = (p as any).slug as string;

    const { data: pv } = await supabase
      .from('variants')
      .select('price, active')
      .eq('product_id', pid)
      .eq('active', true)
      .order('price', { ascending: true })
      .limit(1);
    const fromPrice = pv && pv.length ? Number((pv[0] as any).price) : null;

    const { data: media } = await supabase
      .from('product_media')
      .select('url, type, sort')
      .eq('product_id', pid)
      .eq('type', 'image')
      .order('sort', { ascending: true })
      .limit(1);
    const image = media && media.length ? ((media[0] as any).url as string) : null;

    cards.push({ id: pid, name, slug, fromPrice, image });
  }

  // If there is only one active product, route directly to its LP instead of showing a listing.
  if (cards.length === 1) {
    const only = cards[0];
    redirect(`/lp/${only.slug}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-blue-900">Products</h1>
          <Link href="/" className="text-blue-700 hover:text-blue-900 text-sm font-medium">
            Back to home
          </Link>
        </header>

        {cards.length === 0 ? (
          <p className="text-sm text-blue-800">No products available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((p) => (
              <Link
                key={p.id}
                href={`/lp/${p.slug}`}
                className="group rounded-xl border border-blue-100 bg-white hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="aspect-[4/3] w-full bg-blue-50 grid place-items-center overflow-hidden">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    />
                  ) : (
                    <div className="text-blue-300 text-sm">Image coming soon</div>
                  )}
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-medium text-blue-900 truncate">{p.name}</div>
                  <div className="text-sm text-blue-700">
                    {p.fromPrice != null ? `From PKR ${Number(p.fromPrice).toLocaleString()}` : 'Price coming soon'}
                  </div>
                  <div className="pt-2 text-sm text-blue-600 group-hover:text-blue-800 font-medium">View product </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
