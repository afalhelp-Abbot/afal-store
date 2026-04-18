'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { trackConsignment, getLatestMnpStatus, mapMnpStatusToOrderStatus } from '@/lib/mnp';
import { revalidatePath } from 'next/cache';
import { sendDeliveredEventToMeta } from '@/app/admin/orders/[id]/metaDelivered';

const MAX_ORDERS_PER_RUN = 200;

export async function bulkSyncMnpStatusAction() {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // Get M&P orders that can be synced
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, short_code, status, courier_tracking_number, courier_id, couriers!inner(id, name, api_type)')
    .eq('couriers.api_type', 'mnp')
    .not('courier_tracking_number', 'is', null)
    .in('status', ['shipped', 'packed', 'return_in_transit'])
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS_PER_RUN);

  if (ordersErr) {
    return { ok: false, message: `Failed to fetch orders: ${ordersErr.message}` } as const;
  }

  if (!orders || orders.length === 0) {
    return { ok: true, totalProcessed: 0, updated: 0, errors: 0 } as const;
  }

  // Create sync log entry
  const { data: syncLog } = await supabase
    .from('courier_sync_logs')
    .insert({
      courier_api_type: 'mnp',
      sync_type: 'bulk_tracking',
      triggered_by: 'manual',
      status: 'running',
      total_orders: orders.length,
    })
    .select()
    .single();

  let updated = 0;
  let errors = 0;
  const errorDetails: any[] = [];

  // Process each order
  for (const order of orders) {
    try {
      const trackingResult = await trackConsignment(order.courier_tracking_number);

      if (!trackingResult || trackingResult.isSuccess !== 'true') {
        errors++;
        errorDetails.push({
          orderId: order.id,
          shortCode: order.short_code,
          error: trackingResult?.message || 'Failed to fetch tracking',
        });
        continue;
      }

      const mnpStatus = getLatestMnpStatus(trackingResult);
      if (!mnpStatus) {
        continue; // No status change needed
      }

      const newStatus = mapMnpStatusToOrderStatus(mnpStatus);
      
      // Only update if status changed
      if (newStatus && newStatus !== order.status) {
        const { error: updateErr } = await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', order.id);

        if (updateErr) {
          errors++;
          errorDetails.push({
            orderId: order.id,
            shortCode: order.short_code,
            error: updateErr.message,
          });
        } else {
          updated++;
          
          // Send Delivered event to Meta CAPI (fire once, non-blocking)
          if (newStatus === 'delivered') {
            sendDeliveredEventToMeta(order.id).catch((err: any) => {
              console.error('[bulk-sync] Meta Delivered event failed', { orderId: order.id, error: err?.message });
            });
          }
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err: any) {
      errors++;
      errorDetails.push({
        orderId: order.id,
        shortCode: order.short_code,
        error: err.message,
      });
    }
  }

  // Update sync log
  if (syncLog) {
    await supabase
      .from('courier_sync_logs')
      .update({
        ended_at: new Date().toISOString(),
        status: errors > 0 ? 'completed_with_errors' : 'completed',
        orders_updated: updated,
        api_calls_made: orders.length,
        errors: errorDetails.length > 0 ? errorDetails : null,
        error_message: errors > 0 ? `${errors} errors occurred` : null,
      })
      .eq('id', syncLog.id);
  }

  revalidatePath('/admin/reports/bulk-sync');
  revalidatePath('/admin/orders');

  return { ok: true, totalProcessed: orders.length, updated, errors } as const;
}
