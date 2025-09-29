import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export default async function ProductsListPage() {
  const supabase = getSupabaseServerClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, active, description_en, description_ur')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <Link href="/admin/products/new" className="px-3 py-2 rounded bg-black text-white hover:bg-gray-800">Add product</Link>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Slug</th>
            <th className="py-2 pr-4">Active</th>
            <th className="py-2 pr-4">Descriptions</th>
            <th className="py-2 pr-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(products ?? []).map((p) => (
            <tr key={(p as any).id} className="border-b last:border-0">
              <td className="py-2 pr-4">{(p as any).name}</td>
              <td className="py-2 pr-4 font-mono">{(p as any).slug}</td>
              <td className="py-2 pr-4">{(p as any).active ? 'Yes' : 'No'}</td>
              <td className="py-2 pr-4">
                <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${ (p as any).description_en ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>EN</span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs ${ (p as any).description_ur ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>UR</span>
              </td>
              <td className="py-2 pr-4">
                <div className="flex gap-2">
                  <Link href={`/admin/products/${(p as any).id}`} className="text-blue-600 hover:underline">Edit</Link>
                  <Link href={`/lp/${(p as any).slug}`} className="text-gray-700 hover:underline" target="_blank">View LP</Link>
                </div>
              </td>
            </tr>
          ))}
          {(!products || products.length === 0) && (
            <tr>
              <td className="py-6 text-gray-500" colSpan={5}>No products found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
