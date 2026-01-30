'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';

export async function updateCourierAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const orderId = String(formData.get('orderId') || '');
  const courierId = String(formData.get('courierId') || '') || null;
  const trackingNumber = String(formData.get('trackingNumber') || '') || null;
  const notes = String(formData.get('notes') || '') || null;

  if (!orderId) {
    return { ok: false, message: 'Order ID is required' } as const;
  }

  const { error } = await supabase
    .from('orders')
    .update({
      courier_id: courierId,
      courier_tracking_number: trackingNumber,
      courier_notes: notes,
    })
    .eq('id', orderId);

  if (error) {
    console.error('[admin/orders] courier update error', { orderId, message: error.message });
    return { ok: false, message: error.message } as const;
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  return { ok: true } as const;
}
