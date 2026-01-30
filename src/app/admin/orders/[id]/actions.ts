'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';

export async function updateStatusAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  await requireAdmin();

  if (!id || !status) {
    return { ok: false, message: 'Missing id or status' } as const;
  }

  const allowed = ['pending', 'packed', 'shipped', 'delivered', 'return_in_transit', 'cancelled', 'returned'];
  if (!allowed.includes(status)) {
    return { ok: false, message: 'Invalid status' } as const;
  }

  const supabase = getSupabaseServerClient();

  // Fetch current status for transition validation
  const { data: existing, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return { ok: false, message: fetchErr.message } as const;
  const fromStatus = String(existing?.status || 'pending');

  // If no change, do nothing
  if (fromStatus === status) {
    return { ok: true } as const;
  }

  const from = fromStatus.toLowerCase();
  const to = status.toLowerCase();

  // Enforce high-level transition rules
  if (from === 'shipped' && to === 'cancelled') {
    return { ok: false, message: 'Cannot change shipped orders back to cancelled.' } as const;
  }
  if (from === 'delivered' && to === 'cancelled') {
    return { ok: false, message: 'Cannot cancel delivered orders.' } as const;
  }
  if (from === 'returned' && to !== 'returned') {
    return { ok: false, message: `Cannot move returned orders to ${to}.` } as const;
  }
  if (to === 'returned' && !(from === 'shipped' || from === 'delivered' || from === 'return_in_transit')) {
    return { ok: false, message: 'Returned status is only allowed from Shipped, Delivered, or Return in transit.' } as const;
  }

  // Simple transition: pending -> cancelled
  if (from === 'pending' && to === 'cancelled') {
    const { error: relErr } = await supabase.rpc('release_reserved_for_cancel', {
      p_order_id: id,
    });
    if (relErr) {
      return { ok: false, message: relErr.message } as const;
    }

    const { error: updErr } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id);
    if (updErr) {
      return { ok: false, message: updErr.message } as const;
    }

    revalidatePath(`/admin/orders/${id}`);
    return { ok: true } as const;
  }

  // Collect per-line return conditions when marking as returned
  let returnLines: Record<string, { condition: 'resellable' | 'not_resellable' }> | null = null;
  if (to === 'returned') {
    returnLines = {};
    for (const [key, value] of Array.from(formData.entries())) {
      const match = /^item\[(.+)\]\[return_condition\]$/.exec(String(key));
      if (!match) continue;
      const lineId = match[1];
      const cond = String(value);
      if (cond === 'resellable' || cond === 'not_resellable') {
        returnLines[lineId] = { condition: cond };
      }
    }
  }

  // For transitions that don't need inventory changes, just update status directly
  const noInventoryTransitions = [
    'shipped->return_in_transit',
    'shipped->delivered',
    'delivered->return_in_transit',
    'pending->packed',
    'packed->shipped',
    'packed->pending',
  ];
  const transitionKey = `${from}->${to}`;

  if (noInventoryTransitions.includes(transitionKey)) {
    const { error: updErr } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id);
    if (updErr) {
      console.error('[admin/orders] status update error', { id, from, to, message: updErr.message });
      return { ok: false, message: updErr.message } as const;
    }
    revalidatePath(`/admin/orders/${id}`);
    return { ok: true } as const;
  }

  // Delegate all inventory math + status update to Postgres RPC
  const { error: rpcError } = await supabase.rpc('adjust_inventory_for_order_status', {
    p_order_id: id,
    p_from_status: fromStatus,
    p_to_status: status,
    p_return_lines: returnLines,
  });
  if (rpcError) {
    console.error('[admin/orders] adjust_inventory_for_order_status error', {
      id,
      fromStatus,
      toStatus: status,
      message: rpcError.message,
    });
    return { ok: false, message: rpcError.message } as const;
  }

  revalidatePath(`/admin/orders/${id}`);
  return { ok: true } as const;
}
