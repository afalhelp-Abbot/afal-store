import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

type Courier = {
  id: string;
  name: string;
  code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  api_type: string | null;
  created_at: string;
};

async function createCourierAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, message: 'Name is required' };

  const { error } = await supabase.from('couriers').insert({
    name,
    code: formData.get('code') || null,
    contact_name: formData.get('contact_name') || null,
    phone: formData.get('phone') || null,
    email: formData.get('email') || null,
    address: formData.get('address') || null,
    website: formData.get('website') || null,
    notes: formData.get('notes') || null,
    is_active: formData.get('is_active') === 'true',
    api_type: formData.get('api_type') || 'manual',
  });

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/couriers');
  return { ok: true };
}

async function updateCourierAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '').trim();
  if (!id || !name) return { ok: false, message: 'ID and Name are required' };

  const { error } = await supabase
    .from('couriers')
    .update({
      name,
      code: formData.get('code') || null,
      contact_name: formData.get('contact_name') || null,
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      website: formData.get('website') || null,
      notes: formData.get('notes') || null,
      is_active: formData.get('is_active') === 'true',
      api_type: formData.get('api_type') || 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/couriers');
  return { ok: true };
}

async function toggleActiveAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const id = String(formData.get('id') || '');
  const currentActive = formData.get('is_active') === 'true';

  const { error } = await supabase
    .from('couriers')
    .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/couriers');
  return { ok: true };
}

export default async function CouriersPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const { data: couriers } = await supabase
    .from('couriers')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  const editId = searchParams.edit;
  const editingCourier = editId
    ? (couriers ?? []).find((c: Courier) => c.id === editId)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Couriers</h1>
        <Link href="/admin/couriers/city-mappings" className="text-sm underline">
          City Mappings →
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Courier List */}
        <div className="lg:col-span-2 border rounded p-4">
          <h2 className="font-medium mb-4">All Couriers</h2>
          {(!couriers || couriers.length === 0) ? (
            <p className="text-gray-500 text-sm">No couriers yet. Add one using the form.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">API Type</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">Active</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(couriers as Courier[]).map((c) => (
                    <tr key={c.id} className={`border-b ${!c.is_active ? 'opacity-50' : ''}`}>
                      <td className="py-2 pr-4 font-medium">{c.name}</td>
                      <td className="py-2 pr-4 text-gray-600">{c.code || '—'}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${c.api_type === 'leopards' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                          {c.api_type || 'manual'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{c.phone || '—'}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 space-x-2">
                        <Link
                          href={`/admin/couriers?edit=${c.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </Link>
                        <form action={toggleActiveAction} className="inline">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="is_active" value={String(c.is_active)} />
                          <button type="submit" className="text-gray-600 hover:underline">
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add/Edit Form */}
        <div className="border rounded p-4">
          <h2 className="font-medium mb-4">
            {editingCourier ? `Edit: ${editingCourier.name}` : 'Add New Courier'}
          </h2>
          <form
            action={editingCourier ? updateCourierAction : createCourierAction}
            className="space-y-3"
          >
            {editingCourier && (
              <input type="hidden" name="id" value={editingCourier.id} />
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                name="name"
                defaultValue={editingCourier?.name || ''}
                required
                className="border rounded px-3 py-2 w-full"
                placeholder="e.g., Leopards"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <input
                type="text"
                name="code"
                defaultValue={editingCourier?.code || ''}
                className="border rounded px-3 py-2 w-full"
                placeholder="e.g., LEOPARDS"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Contact Name</label>
              <input
                type="text"
                name="contact_name"
                defaultValue={editingCourier?.contact_name || ''}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="text"
                name="phone"
                defaultValue={editingCourier?.phone || ''}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                name="email"
                defaultValue={editingCourier?.email || ''}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                type="text"
                name="address"
                defaultValue={editingCourier?.address || ''}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Website</label>
              <input
                type="url"
                name="website"
                defaultValue={editingCourier?.website || ''}
                className="border rounded px-3 py-2 w-full"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                name="notes"
                defaultValue={editingCourier?.notes || ''}
                className="border rounded px-3 py-2 w-full"
                rows={3}
                placeholder="Special instructions..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">API Integration</label>
              <select
                name="api_type"
                defaultValue={editingCourier?.api_type || 'manual'}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="manual">Manual (no API)</option>
                <option value="leopards">Leopards</option>
                <option value="daewoo">Daewoo</option>
                <option value="tcs">TCS</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_active"
                value="true"
                defaultChecked={editingCourier?.is_active ?? true}
                id="is_active"
              />
              <label htmlFor="is_active" className="text-sm">Active</label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="bg-black text-white rounded px-4 py-2"
              >
                {editingCourier ? 'Update' : 'Add Courier'}
              </button>
              {editingCourier && (
                <Link
                  href="/admin/couriers"
                  className="border rounded px-4 py-2 text-gray-600"
                >
                  Cancel
                </Link>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
