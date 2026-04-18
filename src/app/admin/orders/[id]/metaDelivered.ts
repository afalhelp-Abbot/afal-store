/**
 * Send "Delivered" event to Meta Conversions API
 * 
 * Called when an order status changes to "delivered" for the first time.
 * 
 * Features:
 * - Fire once guard via delivered_reported_to_meta_at
 * - Pixel resolution via entry_lp_slug → product → product_pixel
 * - Error tracking via status/error/attempted_at columns
 * - Pakistan phone normalization for better match quality
 */

import { getSupabaseServiceClient } from '@/lib/supabaseService';
import { buildDeliveredEvent, sendMetaEvent } from '@/lib/metaCapi';
import { getMetaContentId } from '@/lib/metaContentId';

/**
 * Send Delivered event to Meta CAPI for an order
 * 
 * - Only fires if delivered_reported_to_meta_at is NULL (fire once)
 * - Resolves pixel from entry_lp_slug → product → product_pixel (deterministic)
 * - Updates status columns for visibility
 */
export async function sendDeliveredEventToMeta(orderId: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}> {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  try {
    // 1. Fetch order with attribution data + entry_lp_slug for pixel resolution
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, total, email, phone, fbp, fbc, delivered_reported_to_meta_at, entry_lp_slug')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      await updateMetaStatus(supabase, orderId, 'failed', orderErr?.message || 'Order not found');
      return { ok: false, error: orderErr?.message || 'Order not found' };
    }

    // 2. Check if already reported (fire once)
    if (order.delivered_reported_to_meta_at) {
      console.log('[metaDelivered] Already reported, skipping', { orderId });
      return { ok: true, skipped: true, reason: 'already_reported' };
    }

    // 3. Mark as pending (attempted)
    await supabase
      .from('orders')
      .update({ 
        delivered_report_to_meta_status: 'pending',
        delivered_report_to_meta_attempted_at: now,
        delivered_report_to_meta_error: null,
      })
      .eq('id', orderId);

    // 4. Get order lines for contents
    const { data: lines } = await supabase
      .from('order_lines')
      .select('variant_id, qty, unit_price, variants!inner(sku, product_id)')
      .eq('order_id', orderId);

    const lineRows = (lines as any[]) || [];
    if (lineRows.length === 0) {
      await updateMetaStatus(supabase, orderId, 'failed', 'No order lines found');
      return { ok: false, error: 'No order lines found' };
    }

    // 5. Resolve pixel ID - PRIORITY: entry_lp_slug → product → product_pixel
    let resolvedPixelId: string | undefined = undefined;
    let resolvedContentIdSource: 'sku' | 'variant_id' = 'sku';
    let pixelSource = 'none';

    // 5a. Try entry_lp_slug first (most accurate for attribution)
    if (order.entry_lp_slug) {
      const { data: entryProduct } = await supabase
        .from('products')
        .select('id')
        .eq('slug', order.entry_lp_slug)
        .maybeSingle();

      if (entryProduct?.id) {
        const { data: entryPixel } = await supabase
          .from('product_pixel')
          .select('pixel_id, content_id_source, enabled')
          .eq('product_id', entryProduct.id)
          .eq('enabled', true)
          .maybeSingle();

        if (entryPixel?.pixel_id) {
          resolvedPixelId = String(entryPixel.pixel_id).trim();
          resolvedContentIdSource = entryPixel.content_id_source === 'variant_id' ? 'variant_id' : 'sku';
          pixelSource = 'entry_lp';
        }
      }
    }

    // 5b. Fallback: first order line's product pixel
    if (!resolvedPixelId && lineRows.length > 0) {
      const firstProductId = lineRows[0]?.variants?.product_id;
      if (firstProductId) {
        const { data: firstPixel } = await supabase
          .from('product_pixel')
          .select('pixel_id, content_id_source, enabled')
          .eq('product_id', firstProductId)
          .eq('enabled', true)
          .maybeSingle();

        if (firstPixel?.pixel_id) {
          resolvedPixelId = String(firstPixel.pixel_id).trim();
          resolvedContentIdSource = firstPixel.content_id_source === 'variant_id' ? 'variant_id' : 'sku';
          pixelSource = 'first_line';
        }
      }
    }

    // 5c. Fallback: global pixel from env
    if (!resolvedPixelId) {
      resolvedPixelId = (process.env.META_PIXEL_ID || process.env.FB_PIXEL_ID || '').trim() || undefined;
      if (resolvedPixelId) pixelSource = 'global_env';
    }

    if (!resolvedPixelId) {
      console.warn('[metaDelivered] No pixel ID found, skipping', { orderId });
      await updateMetaStatus(supabase, orderId, 'failed', 'No pixel ID configured');
      return { ok: true, skipped: true, reason: 'no_pixel_id' };
    }

    // 6. Get access token
    const accessToken = process.env.META_CONVERSIONS_API_TOKEN || process.env.FB_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn('[metaDelivered] No access token, skipping', { orderId });
      await updateMetaStatus(supabase, orderId, 'failed', 'No access token configured');
      return { ok: true, skipped: true, reason: 'no_access_token' };
    }

    // 7. Build contents array
    const contents = lineRows.map((r) => ({
      id: getMetaContentId(
        { id: String(r.variant_id), sku: r?.variants?.sku || null },
        resolvedContentIdSource
      ),
      quantity: Number(r.qty),
      item_price: Number(r.unit_price),
    }));

    // 8. Build and send Delivered event
    const event = buildDeliveredEvent({
      id: order.id,
      total: Number(order.total) || 0,
      email: order.email,
      phone: order.phone,
      fbp: order.fbp,
      fbc: order.fbc,
      contents,
    });

    console.log('[metaDelivered] Sending event', { 
      orderId, 
      pixelId: resolvedPixelId,
      pixelSource,
      event_id: event.event_id,
    });

    const result = await sendMetaEvent({
      pixelId: resolvedPixelId,
      accessToken,
      event,
      testEventCode: process.env.NODE_ENV !== 'production' 
        ? (process.env.FB_TEST_EVENT_CODE || undefined) 
        : undefined,
    });

    if (!result.ok) {
      console.error('[metaDelivered] Failed to send', { orderId, error: result.error });
      await updateMetaStatus(supabase, orderId, 'failed', result.error || 'Failed to send event');
      return { ok: false, error: result.error || 'Failed to send event' };
    }

    // 9. Mark as sent (success) - only set reported_at on success
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ 
        delivered_reported_to_meta_at: now,
        delivered_report_to_meta_status: 'sent',
        delivered_report_to_meta_error: null,
      })
      .eq('id', orderId);

    if (updateErr) {
      console.error('[metaDelivered] Failed to update timestamp', { orderId, error: updateErr.message });
    }

    console.log('[metaDelivered] Success', { orderId, event_id: event.event_id, pixelSource });
    return { ok: true };

  } catch (e: any) {
    console.error('[metaDelivered] Exception', { orderId, error: e?.message });
    await updateMetaStatus(supabase, orderId, 'failed', e?.message || 'Unknown error');
    return { ok: false, error: e?.message || 'Unknown error' };
  }
}

/**
 * Helper to update Meta delivery status columns
 */
async function updateMetaStatus(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  orderId: string,
  status: 'pending' | 'sent' | 'failed',
  error?: string | null
) {
  try {
    await supabase
      .from('orders')
      .update({
        delivered_report_to_meta_status: status,
        delivered_report_to_meta_error: error || null,
        delivered_report_to_meta_attempted_at: new Date().toISOString(),
      })
      .eq('id', orderId);
  } catch (e) {
    console.error('[metaDelivered] Failed to update status', { orderId, status, error: e });
  }
}
