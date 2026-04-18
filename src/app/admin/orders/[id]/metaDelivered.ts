/**
 * Send "Delivered" event to Meta Conversions API
 * 
 * Called when an order status changes to "delivered" for the first time.
 * Uses the same pixel resolution logic as Purchase events.
 */

import { getSupabaseServiceClient } from '@/lib/supabaseService';
import { buildDeliveredEvent, sendMetaEvent } from '@/lib/metaCapi';
import { getMetaContentId } from '@/lib/metaContentId';

type OrderForDelivered = {
  id: string;
  total: number;
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  delivered_reported_to_meta_at?: string | null;
};

/**
 * Send Delivered event to Meta CAPI for an order
 * 
 * - Only fires if delivered_reported_to_meta_at is NULL (fire once)
 * - Resolves pixel from product_pixel table (same as Purchase)
 * - Updates delivered_reported_to_meta_at on success
 */
export async function sendDeliveredEventToMeta(orderId: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}> {
  const supabase = getSupabaseServiceClient();

  try {
    // 1. Fetch order with attribution data
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, total, email, phone, fbp, fbc, delivered_reported_to_meta_at')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return { ok: false, error: orderErr?.message || 'Order not found' };
    }

    // 2. Check if already reported (fire once)
    if (order.delivered_reported_to_meta_at) {
      console.log('[metaDelivered] Already reported, skipping', { orderId });
      return { ok: true, skipped: true, reason: 'already_reported' };
    }

    // 3. Get order lines for contents and pixel resolution
    const { data: lines } = await supabase
      .from('order_lines')
      .select('variant_id, qty, unit_price, variants!inner(sku, product_id)')
      .eq('order_id', orderId);

    const lineRows = (lines as any[]) || [];
    if (lineRows.length === 0) {
      return { ok: false, error: 'No order lines found' };
    }

    // 4. Resolve pixel ID from product_pixel table (same logic as Purchase)
    const productIdsSet = new Set<string>();
    for (const r of lineRows) {
      const pid = r?.variants?.product_id as string | undefined;
      if (pid) productIdsSet.add(pid);
    }

    let resolvedPixelId: string | undefined = undefined;
    let resolvedContentIdSource: 'sku' | 'variant_id' = 'sku';

    if (productIdsSet.size > 0) {
      const productIds = Array.from(productIdsSet);
      const { data: pixelRows } = await supabase
        .from('product_pixel')
        .select('product_id, enabled, pixel_id, content_id_source')
        .in('product_id', productIds);

      const enabledRows = (pixelRows || []).filter((p: any) => !!p?.enabled && !!(p?.pixel_id || '').trim());
      const enabledPixels = enabledRows.map((p: any) => String(p.pixel_id).trim());
      const distinct = Array.from(new Set(enabledPixels));

      if (distinct.length === 1) {
        resolvedPixelId = distinct[0];
        const sources = Array.from(new Set(enabledRows.map((p: any) => 
          p.content_id_source === 'variant_id' ? 'variant_id' : 'sku'
        )));
        if (sources.length === 1) {
          resolvedContentIdSource = sources[0] as 'sku' | 'variant_id';
        }
      }
    }

    // Fallback to global pixel
    if (!resolvedPixelId) {
      resolvedPixelId = (process.env.META_PIXEL_ID || process.env.FB_PIXEL_ID || '').trim() || undefined;
    }

    if (!resolvedPixelId) {
      console.warn('[metaDelivered] No pixel ID found, skipping', { orderId });
      return { ok: true, skipped: true, reason: 'no_pixel_id' };
    }

    // 5. Get access token
    const accessToken = process.env.META_CONVERSIONS_API_TOKEN || process.env.FB_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn('[metaDelivered] No access token, skipping', { orderId });
      return { ok: true, skipped: true, reason: 'no_access_token' };
    }

    // 6. Build contents array
    const contents = lineRows.map((r) => ({
      id: getMetaContentId(
        { id: String(r.variant_id), sku: r?.variants?.sku || null },
        resolvedContentIdSource
      ),
      quantity: Number(r.qty),
      item_price: Number(r.unit_price),
    }));

    // 7. Build and send Delivered event
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
      return { ok: false, error: result.error || 'Failed to send event' };
    }

    // 8. Mark as reported (fire once)
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ delivered_reported_to_meta_at: new Date().toISOString() })
      .eq('id', orderId);

    if (updateErr) {
      console.error('[metaDelivered] Failed to update timestamp', { orderId, error: updateErr.message });
      // Event was sent, so return ok but log the error
    }

    console.log('[metaDelivered] Success', { orderId, event_id: event.event_id });
    return { ok: true };

  } catch (e: any) {
    console.error('[metaDelivered] Exception', { orderId, error: e?.message });
    return { ok: false, error: e?.message || 'Unknown error' };
  }
}
