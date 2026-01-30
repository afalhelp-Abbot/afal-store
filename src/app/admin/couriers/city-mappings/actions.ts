'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getCities } from '@/lib/leopards';
import { revalidatePath } from 'next/cache';

export async function fetchLeopardsCitiesAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const courierId = String(formData.get('courierId') || '');
  if (!courierId) {
    return { ok: false, message: 'Courier ID is required' } as const;
  }

  try {
    const result = await getCities();

    if (result.status !== 1 || !result.city_list?.length) {
      return { ok: false, message: result.message || 'No cities returned from Leopards' } as const;
    }

    // Insert cities as mappings (our_city_name = courier_city_name initially)
    // User can then add variations manually
    let insertedCount = 0;
    for (const city of result.city_list) {
      const { error } = await supabase.from('courier_city_mappings').upsert(
        {
          courier_id: courierId,
          our_city_name: city.name,
          courier_city_name: city.name,
          courier_city_code: city.id,
        },
        {
          onConflict: 'courier_id,our_city_name',
          ignoreDuplicates: true,
        }
      );
      if (!error) insertedCount++;
    }

    revalidatePath('/admin/couriers/city-mappings');
    return { ok: true, count: insertedCount } as const;
  } catch (err: any) {
    return { ok: false, message: `API error: ${err.message}` } as const;
  }
}
