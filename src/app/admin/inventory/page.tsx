import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import RowEditor from './row-editor';

async function getRows() {
  const supabase = getSupabaseServerClient();
  // Prefer the view if present; otherwise join tables
  const { data, error } = await supabase
    .from('inventory_overview')
    .select('*')
    .order('sku');
  if (error) throw error;
  return data ?? [];
}

export default async function InventoryPage() {
  await requireAdmin();
  const rows = await getRows();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="text-sm text-gray-600">Tip: edit Price or On Hand and press Save to update Supabase.</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Product</th>
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4">Price</th>
              <th className="py-2 pr-4">On Hand</th>
              <th className="py-2 pr-4">Reserved</th>
              <th className="py-2 pr-4">Available</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <RowEditor
                key={r.sku}
                sku={r.sku}
                product={r.product}
                initialPrice={r.price}
                initialOnHand={r.stock_on_hand}
                reserved={r.reserved}
                available={r.available}
                updatePrice={updatePrice}
                setStock={setStock}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-6">
        <h2 className="font-medium mb-2">Quick Adjust (optional)</h2>
        <AdjustStockForm />
      </div>
    </div>
  );
}

async function adjustStock(formData: FormData) {
  'use server';
  const sku = String(formData.get('sku') ?? '');
  const delta = Number(formData.get('delta') ?? 0);
  const reason = String(formData.get('reason') ?? 'manual adjustment');
  if (!sku || !Number.isFinite(delta) || delta === 0) {
    return { ok: false, message: 'Provide SKU and non-zero delta' };
  }
  const supabase = getSupabaseServerClient();
  // Verify admin via profiles
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { ok: false, message: 'Not authenticated' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, message: 'Not authorized' };

  // Call secure RPC that logs and adjusts atomically on the DB side
  const { error } = await supabase.rpc('adjust_stock', {
    p_sku: sku,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function updatePrice(formData: FormData) {
  'use server';
  const sku = String(formData.get('sku') ?? '');
  const price = Number(formData.get('price'));
  if (!sku || !Number.isFinite(price) || price < 0) return;
  const supabase = getSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (!profile?.is_admin) return;
  await supabase.from('variants').update({ price }).eq('sku', sku);
}

async function setStock(formData: FormData) {
  'use server';
  const sku = String(formData.get('sku') ?? '');
  const target = Number(formData.get('on_hand'));
  if (!sku || !Number.isFinite(target) || target < 0) return;
  const supabase = getSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (!profile?.is_admin) return;
  // Fetch current on_hand
  const { data: v } = await supabase.from('variants').select('id').eq('sku', sku).maybeSingle();
  if (!v?.id) return;
  const { data: inv } = await supabase.from('inventory').select('stock_on_hand').eq('variant_id', v.id).maybeSingle();
  const current = inv?.stock_on_hand ?? 0;
  const delta = target - current;
  if (delta === 0) return;
  await supabase.rpc('adjust_stock', { p_sku: sku, p_delta: delta, p_reason: 'set stock' });
}

function AdjustStockForm() {
  return (
    <form action={adjustStock} className="flex flex-wrap items-end gap-3 border rounded p-4">
      <div>
        <label className="block text-sm">SKU</label>
        <input name="sku" className="border rounded px-3 py-2" placeholder="AFTAG-BLK-1" />
      </div>
      <div>
        <label className="block text-sm">Delta (+/-)</label>
        <input name="delta" type="number" className="border rounded px-3 py-2 w-32" placeholder="-1" />
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-sm">Reason</label>
        <input name="reason" className="border rounded px-3 py-2 w-full" placeholder="manual adjustment" />
      </div>
      <button className="bg-black text-white rounded px-4 py-2">Apply</button>
    </form>
  );
}
