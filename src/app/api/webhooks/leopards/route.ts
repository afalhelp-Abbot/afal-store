import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mapLeopardsStatus } from '@/lib/leopards';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

type LeopardsWebhookItem = {
  track_number?: string;
  tracking_number?: string;
  cn_number?: string;
  status?: string;
  booked_packet_status?: string;
  status_date?: string;
  remarks?: string;
};

export async function POST(request: NextRequest) {
  // Verify webhook secret
  const secret = request.headers.get('X-Leopards-Secret') || request.headers.get('x-leopards-secret');
  const expectedSecret = process.env.LEOPARDS_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error('[leopards-webhook] LEOPARDS_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  if (secret !== expectedSecret) {
    console.error('[leopards-webhook] Invalid secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch (err) {
    console.error('[leopards-webhook] Invalid JSON payload');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Handle both single object and array payloads
  let items: LeopardsWebhookItem[] = [];
  if (Array.isArray(payload)) {
    items = payload;
  } else if (Array.isArray(payload.data)) {
    items = payload.data;
  } else if (payload.track_number || payload.tracking_number || payload.cn_number) {
    items = [payload];
  } else {
    console.warn('[leopards-webhook] Unknown payload format', payload);
    return NextResponse.json({ error: 'Unknown payload format' }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const results: Array<{ trackingNumber: string; success: boolean; message: string }> = [];

  for (const item of items) {
    const trackingNumber = item.track_number || item.tracking_number || item.cn_number;
    const leopardsStatus = item.status || item.booked_packet_status || '';

    if (!trackingNumber) {
      results.push({ trackingNumber: 'unknown', success: false, message: 'No tracking number' });
      continue;
    }

    // Find order by tracking number
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, courier_id')
      .eq('courier_tracking_number', trackingNumber)
      .maybeSingle();

    if (orderErr || !order) {
      results.push({ trackingNumber, success: false, message: 'Order not found' });
      continue;
    }

    const oldStatus = order.status;
    const newStatus = mapLeopardsStatus(leopardsStatus);

    // Log the webhook regardless of status change
    await supabase.from('courier_status_logs').insert({
      order_id: order.id,
      courier_id: order.courier_id,
      tracking_number: trackingNumber,
      old_status: oldStatus,
      new_status: newStatus || oldStatus,
      courier_status: leopardsStatus,
      raw_payload: item,
    });

    // Only update if we have a mapped status and it's different
    if (newStatus && newStatus !== oldStatus) {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', order.id);

      if (updateErr) {
        results.push({ trackingNumber, success: false, message: updateErr.message });
        continue;
      }

      results.push({ trackingNumber, success: true, message: `Status updated: ${oldStatus} → ${newStatus}` });
    } else {
      results.push({ trackingNumber, success: true, message: `No status change (${leopardsStatus})` });
    }
  }

  console.log('[leopards-webhook] Processed', results.length, 'items');
  return NextResponse.json({ processed: results.length, results });
}
