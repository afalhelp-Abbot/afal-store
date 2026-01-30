import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { FetchCitiesClient } from './FetchCitiesClient';

type CityMapping = {
  id: string;
  courier_id: string;
  our_city_name: string;
  courier_city_name: string;
  courier_city_code: string | null;
  created_at: string;
  couriers?: { name: string };
};

type Courier = {
  id: string;
  name: string;
  api_type: string | null;
};

async function createMappingAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const courier_id = String(formData.get('courier_id') || '').trim();
  const our_city_name = String(formData.get('our_city_name') || '').trim();
  const courier_city_name = String(formData.get('courier_city_name') || '').trim();
  const courier_city_code = String(formData.get('courier_city_code') || '').trim() || null;

  if (!courier_id || !our_city_name || !courier_city_name) {
    return { ok: false, message: 'Courier, Our City, and Courier City are required' };
  }

  const { error } = await supabase.from('courier_city_mappings').insert({
    courier_id,
    our_city_name,
    courier_city_name,
    courier_city_code,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, message: 'Mapping already exists for this courier and city' };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath('/admin/couriers/city-mappings');
  return { ok: true };
}

async function updateMappingAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const id = String(formData.get('id') || '');
  const courier_city_name = String(formData.get('courier_city_name') || '').trim();
  const courier_city_code = String(formData.get('courier_city_code') || '').trim() || null;

  if (!id || !courier_city_name) {
    return { ok: false, message: 'ID and Courier City Name are required' };
  }

  const { error } = await supabase
    .from('courier_city_mappings')
    .update({
      courier_city_name,
      courier_city_code,
    })
    .eq('id', id);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/couriers/city-mappings');
  return { ok: true };
}

async function deleteMappingAction(formData: FormData) {
  'use server';
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const id = String(formData.get('id') || '');
  if (!id) return { ok: false, message: 'ID is required' };

  const { error } = await supabase
    .from('courier_city_mappings')
    .delete()
    .eq('id', id);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/couriers/city-mappings');
  return { ok: true };
}

export default async function CityMappingsPage({
  searchParams,
}: {
  searchParams: { edit?: string; courier?: string };
}) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // Fetch couriers with API integration
  const { data: couriers } = await supabase
    .from('couriers')
    .select('id, name, api_type')
    .neq('api_type', 'manual')
    .eq('is_active', true)
    .order('name', { ascending: true });

  const selectedCourier = searchParams.courier || (couriers?.[0]?.id ?? '');

  // Fetch mappings for selected courier
  let mappings: CityMapping[] = [];
  if (selectedCourier) {
    const { data } = await supabase
      .from('courier_city_mappings')
      .select('*, couriers(name)')
      .eq('courier_id', selectedCourier)
      .order('our_city_name', { ascending: true });
    mappings = (data ?? []) as CityMapping[];
  }

  const editId = searchParams.edit;
  const editingMapping = editId
    ? mappings.find((m) => m.id === editId)
    : null;

  const selectedCourierData = couriers?.find((c: Courier) => c.id === selectedCourier);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">City Mappings</h1>
        <Link href="/admin/couriers" className="underline text-sm">
          ← Back to Couriers
        </Link>
      </div>

      <p className="text-sm text-gray-600">
        Map your city names to courier-specific city names/codes. Required for API integrations like Leopards.
      </p>

      {/* Courier Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Courier:</label>
        <div className="flex gap-2">
          {(couriers ?? []).map((c: Courier) => (
            <Link
              key={c.id}
              href={`/admin/couriers/city-mappings?courier=${c.id}`}
              className={`px-3 py-1 rounded text-sm ${
                c.id === selectedCourier
                  ? 'bg-black text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {!couriers?.length && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
          No couriers with API integration found. First, create a courier and set its API type to something other than "Manual".
        </div>
      )}

      {selectedCourier && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mappings List */}
          <div className="lg:col-span-2 border rounded p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium">
                Mappings for {selectedCourierData?.name || 'Selected Courier'}
              </h2>
              {selectedCourierData?.api_type === 'leopards' && (
                <FetchCitiesClient courierId={selectedCourier} />
              )}
            </div>
            {mappings.length === 0 ? (
              <p className="text-gray-500 text-sm">No mappings yet. Add one using the form.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Our City</th>
                      <th className="py-2 pr-4">Courier City Name</th>
                      <th className="py-2 pr-4">Courier City Code</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => (
                      <tr key={m.id} className="border-b">
                        <td className="py-2 pr-4 font-medium">{m.our_city_name}</td>
                        <td className="py-2 pr-4">{m.courier_city_name}</td>
                        <td className="py-2 pr-4 text-gray-600">{m.courier_city_code || '—'}</td>
                        <td className="py-2 pr-4 space-x-2">
                          <Link
                            href={`/admin/couriers/city-mappings?courier=${selectedCourier}&edit=${m.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            Edit
                          </Link>
                          <form action={deleteMappingAction} className="inline">
                            <input type="hidden" name="id" value={m.id} />
                            <button
                              type="submit"
                              className="text-red-600 hover:underline"
                            >
                              Delete
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
              {editingMapping ? `Edit Mapping` : 'Add New Mapping'}
            </h2>
            <form
              action={editingMapping ? updateMappingAction : createMappingAction}
              className="space-y-3"
            >
              {editingMapping && (
                <input type="hidden" name="id" value={editingMapping.id} />
              )}

              {!editingMapping && (
                <>
                  <input type="hidden" name="courier_id" value={selectedCourier} />
                  <div>
                    <label className="block text-sm font-medium mb-1">Our City Name *</label>
                    <input
                      type="text"
                      name="our_city_name"
                      required
                      className="border rounded px-3 py-2 w-full"
                      placeholder="e.g., Lahore"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match exactly what customers enter at checkout
                    </p>
                  </div>
                </>
              )}

              {editingMapping && (
                <div>
                  <label className="block text-sm font-medium mb-1">Our City</label>
                  <div className="border rounded px-3 py-2 bg-gray-50">
                    {editingMapping.our_city_name}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Courier City Name *</label>
                <input
                  type="text"
                  name="courier_city_name"
                  defaultValue={editingMapping?.courier_city_name || ''}
                  required
                  className="border rounded px-3 py-2 w-full"
                  placeholder="e.g., LAHORE"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exact name as required by courier API
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Courier City Code</label>
                <input
                  type="text"
                  name="courier_city_code"
                  defaultValue={editingMapping?.courier_city_code || ''}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="e.g., 789"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional code if courier uses numeric IDs
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="bg-black text-white rounded px-4 py-2"
                >
                  {editingMapping ? 'Update' : 'Add Mapping'}
                </button>
                {editingMapping && (
                  <Link
                    href={`/admin/couriers/city-mappings?courier=${selectedCourier}`}
                    className="border rounded px-4 py-2 text-gray-600"
                  >
                    Cancel
                  </Link>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
