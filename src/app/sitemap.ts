import type { MetadataRoute } from 'next';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = 'https://afalstore.com';
  const supabase = getSupabaseServerClient();
  const { data: products } = await supabase
    .from('products')
    .select('slug, updated_at, active')
    .eq('active', true)
    .order('updated_at', { ascending: false });

  const lpUrls: MetadataRoute.Sitemap = (products || [])
    .filter((p: any) => p.slug)
    .map((p: any) => ({
      url: `${site}/lp/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at as any) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    }));

  // Home and top-level index if applicable
  const root: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ];

  return [...root, ...lpUrls];
}
