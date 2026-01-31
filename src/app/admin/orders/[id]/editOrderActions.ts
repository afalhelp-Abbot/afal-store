'use server';

import { requireAdmin } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { revalidatePath } from 'next/cache';

export type EditOrderInput = {
  orderId: string;
  expectedEditVersion: number; // For concurrency check
  customerName?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  discountTotal?: number;
  shippingAmount?: number;
  lines?: {
    id?: string;
    variantId: string;
    qty: number;
    unitPrice?: number;
  }[];
  reason: string;
  // Actor metadata for multi-country tracking
  actorTimezone?: string;
  userAgent?: string;
};

export type EditOrderResult = {
  success: boolean;
  error?: string;
  errorCode?: string; // 'CONCURRENCY_ERROR' | 'CN_LOCKED'
  totals?: {
    subtotal: number;
    shipping: number;
    discount: number;
    total: number;
  };
  editVersion?: number;
  cnBooked?: boolean;
};

export async function editOrderAction(input: EditOrderInput): Promise<EditOrderResult> {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // Validate required fields
  if (!input.orderId) {
    return { success: false, error: 'Order ID is required' };
  }

  if (!input.reason || input.reason.trim().length < 3) {
    return { success: false, error: 'Please provide a reason for the edit (min 3 characters)' };
  }

  // Check order exists and is editable
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, courier_tracking_number, courier_booked_at')
    .eq('id', input.orderId)
    .maybeSingle();

  if (orderError || !order) {
    return { success: false, error: 'Order not found' };
  }

  // Validate status
  const editableStatuses = ['pending', 'packed'];
  if (!editableStatuses.includes(order.status)) {
    return { success: false, error: `Cannot edit order with status: ${order.status}. Only pending/packed orders can be edited.` };
  }

  // Warn if CN already booked (but allow edit)
  const hasCN = order.courier_tracking_number || order.courier_booked_at;

  // Prepare lines for RPC
  const linesJson = input.lines?.map(line => ({
    id: line.id || null,
    variant_id: line.variantId,
    qty: line.qty,
    unit_price: line.unitPrice || null,
  })) || null;

  // Call the RPC with expected_edit_version for concurrency check
  const { data, error } = await supabase.rpc('apply_order_edit', {
    p_order_id: input.orderId,
    p_expected_edit_version: input.expectedEditVersion,
    p_customer_name: input.customerName || null,
    p_phone: input.phone || null,
    p_alternate_phone: input.alternatePhone || null,
    p_email: input.email || null,
    p_address: input.address || null,
    p_city: input.city || null,
    p_notes: input.notes || null,
    p_discount_total: input.discountTotal ?? null,
    p_shipping_amount: input.shippingAmount ?? null,
    p_lines: linesJson || null,
    p_reason: input.reason,
    p_edited_by: null,
    p_actor_timezone: input.actorTimezone || null,
    p_user_agent: input.userAgent || null,
  });

  if (error) {
    console.error('[editOrderAction] RPC error:', error);
    return { success: false, error: `Database error: ${error.message}` };
  }

  const result = data as any;

  if (!result?.success) {
    return { 
      success: false, 
      error: result?.error || 'Unknown error occurred',
      errorCode: result?.code || undefined,
    };
  }

  revalidatePath(`/admin/orders/${input.orderId}`);
  revalidatePath('/admin/orders');

  return {
    success: true,
    totals: result.totals,
    editVersion: result.edit_version,
    cnBooked: result.cn_booked,
  };
}

// Get order edit history
export async function getOrderEditsAction(orderId: string) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('order_edits')
    .select('id, reason, diff, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getOrderEditsAction] Error:', error);
    return { edits: [], error: error.message };
  }

  return { edits: data || [] };
}

// Get available variants for adding to order
export async function getAvailableVariantsAction(searchQuery?: string) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();

  // First get variants with their products
  let query = supabase
    .from('variants')
    .select('id, sku, price, active, products!inner(id, name)')
    .eq('active', true)
    .order('sku', { ascending: true })
    .limit(50);

  if (searchQuery && searchQuery.trim()) {
    query = query.ilike('sku', `%${searchQuery.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getAvailableVariantsAction] Error:', error);
    return { variants: [], error: error.message };
  }

  // Get stock from inventory table
  const variantIds = (data || []).map((v: any) => v.id);
  let stockMap: Record<string, number> = {};
  
  if (variantIds.length > 0) {
    const { data: invData } = await supabase
      .from('inventory')
      .select('variant_id, stock_on_hand')
      .in('variant_id', variantIds);
    
    for (const inv of invData || []) {
      stockMap[inv.variant_id] = inv.stock_on_hand || 0;
    }
  }

  return {
    variants: (data || []).map((v: any) => ({
      id: v.id,
      sku: v.sku,
      price: v.price,
      stock: stockMap[v.id] || 0,
      productName: v.products?.name || '',
    })),
  };
}
