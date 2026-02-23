'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { bookConsignment } from '@/lib/mnp';
import { revalidatePath } from 'next/cache';

export async function bookWithMnpAction(formData: FormData) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const orderId = String(formData.get('orderId') || '');
  if (!orderId) {
    return { ok: false, message: 'Order ID is required' } as const;
  }

  // Fetch order details
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, short_code, customer_name, phone, email, address, city, courier_id, courier_tracking_number, couriers(id, name, api_type)')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { ok: false, message: orderErr?.message || 'Order not found' } as const;
  }

  // Check if already booked
  if (order.courier_tracking_number) {
    return { ok: false, message: `Order already has tracking number: ${order.courier_tracking_number}` } as const;
  }

  // Get courier - must be M&P
  const courier = order.couriers as any;
  if (!courier || courier.api_type !== 'mnp') {
    return { ok: false, message: 'Order courier must be set to M&P before booking' } as const;
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

  // Book with M&P
  try {
    console.log('[M&P] Order data:', {
      customer_name: order.customer_name,
      phone: order.phone,
      address: order.address,
      city: order.city,
    });

    const result = await bookConsignment({
      consigneeName: order.customer_name || '',
      consigneePhone: order.phone || '',
      consigneeAddress: order.address || '',
      consigneeEmail: order.email || '',
      destinationCityName: order.city || '',
      pieces: 1,
      weight: 0.5,
      codAmount: total,
      custRefNo: order.short_code || orderId,
      productDetails: 'Order from Afal Store',
      service: 'Overnight',
      remarks: 'Handle with care',
    });

    // Log the API call
    await supabase.from('courier_api_logs').insert({
      courier_id: courier.id,
      order_id: orderId,
      endpoint: 'InsertBookingData',
      request_payload: {
        consigneeName: order.customer_name,
        consigneePhone: order.phone,
        consigneeAddress: order.address,
        destinationCityName: order.city,
        custRefNo: order.short_code,
        codAmount: total,
      },
      response_payload: result,
      success: result.isSuccess === 'true',
      error_message: result.isSuccess !== 'true' ? result.message : null,
    });

    console.log('[M&P] Booking response:', JSON.stringify(result, null, 2));

    if (result.isSuccess !== 'true' || !result.orderReferenceId) {
      return { ok: false, message: `Booking failed: ${result.message}` } as const;
    }

    const trackingNumber = result.orderReferenceId;

    // Update order with tracking number and booked timestamp
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
      endpoint: 'InsertBookingData',
      request_payload: { orderId },
      response_payload: null,
      success: false,
      error_message: err.message,
    });

    return { ok: false, message: `API error: ${err.message}` } as const;
  }
}
