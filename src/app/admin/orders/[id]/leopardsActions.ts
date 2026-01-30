'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { bookPacket, trackPackets, mapLeopardsStatus } from '@/lib/leopards';
import { revalidatePath } from 'next/cache';

export async function bookWithLeopardsAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const orderId = String(formData.get('orderId') || '');
  if (!orderId) {
    return { ok: false, message: 'Order ID is required' } as const;
  }

  // Fetch order details
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, short_code, customer_name, phone, address, city, courier_id, courier_tracking_number, couriers(id, name, api_type)')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { ok: false, message: orderErr?.message || 'Order not found' } as const;
  }

  // Check if already booked
  if (order.courier_tracking_number) {
    return { ok: false, message: `Order already has tracking number: ${order.courier_tracking_number}` } as const;
  }

  // Get courier - must be Leopards
  const courier = order.couriers as any;
  if (!courier || courier.api_type !== 'leopards') {
    return { ok: false, message: 'Order courier must be set to Leopards before booking' } as const;
  }

  // Get city mapping for Leopards
  const { data: cityMapping, error: cityErr } = await supabase
    .from('courier_city_mappings')
    .select('courier_city_code, courier_city_name')
    .eq('courier_id', courier.id)
    .eq('our_city_name', order.city)
    .maybeSingle();

  if (cityErr || !cityMapping) {
    return { ok: false, message: `No Leopards city mapping found for "${order.city}". Please add it in city mappings.` } as const;
  }

  // Calculate order total
  const { data: lines } = await supabase
    .from('order_lines')
    .select('line_total')
    .eq('order_id', orderId);

  const { data: orderData } = await supabase
    .from('orders')
    .select('shipping_amount, discount_total')
    .eq('id', orderId)
    .maybeSingle();

  const subtotal = (lines || []).reduce((sum: number, l: any) => sum + Number(l.line_total || 0), 0);
  const shipping = Number(orderData?.shipping_amount || 0);
  const discount = Number(orderData?.discount_total || 0);
  const total = subtotal + shipping - discount;

  // Book with Leopards
  try {
    const result = await bookPacket({
      consigneeName: order.customer_name,
      consigneePhone: order.phone,
      consigneeAddress: order.address,
      consigneeCityCode: cityMapping.courier_city_code || cityMapping.courier_city_name,
      orderRefNumber: order.short_code || orderId,
      collectAmount: total,
      productType: 'COD',
    });

    // Log the API call
    await supabase.from('courier_api_logs').insert({
      courier_id: courier.id,
      order_id: orderId,
      endpoint: 'bookPacket',
      request_payload: {
        consigneeName: order.customer_name,
        consigneePhone: order.phone,
        consigneeAddress: order.address,
        consigneeCityCode: cityMapping.courier_city_code,
        orderRefNumber: order.short_code,
        collectAmount: total,
      },
      response_payload: result,
      success: result.status === 1,
      error_message: result.status !== 1 ? result.message : null,
    });

    if (result.status !== 1 || !result.packet_list?.length) {
      return { ok: false, message: result.message || 'Booking failed - no tracking number returned' } as const;
    }

    const trackingNumber = result.packet_list[0].track_number;

    // Update order with tracking number and booked timestamp (NOT changing status)
    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        courier_tracking_number: trackingNumber,
        courier_booked_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateErr) {
      return { ok: false, message: `Booking succeeded (CN: ${trackingNumber}) but failed to save: ${updateErr.message}` } as const;
    }

    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');

    return { ok: true, trackingNumber } as const;
  } catch (err: any) {
    // Log the error
    await supabase.from('courier_api_logs').insert({
      courier_id: courier.id,
      order_id: orderId,
      endpoint: 'bookPacket',
      request_payload: { orderId },
      response_payload: null,
      success: false,
      error_message: err.message,
    });

    return { ok: false, message: `API error: ${err.message}` } as const;
  }
}
