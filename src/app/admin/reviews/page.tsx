import { requireAdmin } from '@/lib/auth';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Search = { status?: string; productId?: string; q?: string };

async function fetchReviews(search: Search) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(url, svc);
  const status = search.status && ['pending','approved','rejected'].includes(search.status)
    ? search.status
    : 'pending';

  let query = supabase
    .from('product_reviews')
    .select('id, product_id, variant_id, rating, title, body, author_name, created_at, status, order_id')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);

  if (search.productId && search.productId !== 'all') {
    query = query.eq('product_id', search.productId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [] as any[];

  const ids = rows.map((r: any) => r.id);
  const pids = Array.from(new Set(rows.map((r: any) => r.product_id)));

  const [{ data: media }, { data: products }] = await Promise.all([
    supabase.from('product_review_media').select('review_id, url').in('review_id', ids),
    supabase.from('products').select('id, name').in('id', pids),
  ]);

  const mediaById = new Map<string, string[]>();
  for (const m of media ?? []) {
    const rid = (m as any).review_id as string;
    if (!mediaById.has(rid)) mediaById.set(rid, []);
    mediaById.get(rid)!.push((m as any).url as string);
  }
  const nameByPid = new Map<string, string>();
  for (const p of products ?? []) nameByPid.set((p as any).id, (p as any).name);

  return rows.map((r: any) => ({
    ...r,
    product_name: nameByPid.get(r.product_id) || r.product_id,
    images: mediaById.get(r.id) || [],
  }));
}

async function updateReviewStatus(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') || '');
  const to = String(formData.get('status') || '');
  if (!id || !['pending','approved','rejected'].includes(to)) {
    return { ok: false, message: 'Invalid input' } as const;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(url, svc);
  const { error } = await supabase
    .from('product_reviews')
    .update({ status: to })
    .eq('id', id);
  if (error) return { ok: false, message: error.message } as const;
  return { ok: true } as const;
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(url, svc);
  const status = searchParams?.status && ['pending','approved','rejected'].includes(searchParams.status!)
    ? searchParams.status!
    : 'pending';
  const currentProduct = searchParams?.productId ?? 'all';

  const [rows, productsRes] = await Promise.all([
    fetchReviews({ status, productId: currentProduct }),
    supabase.from('products').select('id, name').order('created_at', { ascending: false }),
  ]);
  const products = productsRes.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reviews</h1>

      <form className="flex flex-wrap items-end gap-3 border rounded p-4" action="/admin/reviews" method="get">
        <div>
          <label className="block text-sm">Status</label>
          <select name="status" defaultValue={status} className="border rounded px-3 py-2">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Product</label>
          <select name="productId" defaultValue={currentProduct} className="border rounded px-3 py-2 min-w-[220px]">
            <option value="all">All products</option>
            {(products ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button className="bg-black text-white rounded px-4 py-2">Apply</button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">Rating</th>
              <th className="py-2 pr-4">Title / Body</th>
              <th className="py-2 pr-4">Author</th>
              <th className="py-2 pr-4">Images</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b align-top">
                <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="py-2 pr-4">{r.product_name}</td>
                <td className="py-2 pr-4">{r.rating}</td>
                <td className="py-2 pr-4 max-w-[420px]">
                  <div className="font-medium">{r.title || '-'}</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{r.body}</div>
                </td>
                <td className="py-2 pr-4">{r.author_name || 'Verified buyer'}</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2 flex-wrap max-w-[220px]">
                    {(r.images || []).map((u: string, i: number) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt="media" className="w-12 h-12 object-cover rounded border" />
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-4 capitalize">{r.status}</td>
                <td className="py-2 pr-4">
                  <form action={updateReviewStatus} className="flex gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <button name="status" value="approved" className="px-2 py-1 rounded border bg-white hover:bg-gray-50">Approve</button>
                    <button name="status" value="rejected" className="px-2 py-1 rounded border bg-white hover:bg-gray-50">Reject</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-gray-500" colSpan={8}>No reviews found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border rounded p-4">
        <h2 className="font-medium">Reviews Capabilities (This Page)</h2>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-gray-700">
          <li>Filter by status and product.</li>
          <li>View review details and thumbnails.</li>
          <li>Approve or reject reviews.</li>
        </ul>
      </div>
    </div>
  );
}
