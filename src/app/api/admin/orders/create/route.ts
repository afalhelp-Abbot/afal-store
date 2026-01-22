import { NextResponse } from 'next/server';
import { getSessionAndProfile } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/* Admin-only endpoint to create an order manually (e.g., phone order).
Expected payload (JSON):
{
  "customer": {
    "name": string,
    "email"?: string,
    "phone": string,
    "address": string,
    "city": string,
    "province_code"?: string
  },
  "items": [ { "variant_id": string, "qty": number } ]
}
*/
export async function POST(req: Request) {
  try {
    const { profile } = await getSessionAndProfile();
    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const supabase = getSupabaseServerClient();
    const body = await req.json();

    const items = (body?.items ?? []) as Array<{ variant_id: string; qty: number }>;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items required' }, { status: 400 });
    }
    const customer = body?.customer || {};
    if (!customer.name || !customer.phone || !customer.address || !customer.city) {
      return NextResponse.json({ error: 'Missing customer fields' }, { status: 400 });
    }

    // Lock prices from variants
    const variantIds = items.map((i) => i.variant_id);
    const { data: variants, error: vErr } = await supabase
      .from('variants')
      .select('id, price, active')
      .in('id', variantIds);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    const priceById = new Map<string, number>();
    for (const v of variants ?? []) {
      // @ts-ignore
      if (v.active === false) {
        return NextResponse.json({ error: 'Variant inactive' }, { status: 400 });
      }
      // @ts-ignore
      priceById.set(v.id, Number(v.price));
    }
    for (const it of items) {
      if (!priceById.has(it.variant_id)) {
        return NextResponse.json({ error: `Variant not found: ${it.variant_id}` }, { status: 400 });
      }
      if (!Number.isFinite(it.qty) || it.qty <= 0) {
        return NextResponse.json({ error: `Invalid qty for ${it.variant_id}` }, { status: 400 });
      }
    }

    // Create order header
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .insert({
        status: 'pending',
        customer_name: customer.name,
        email: customer.email ?? null,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        province_code: customer.province_code ?? null,
      })
      .select('id')
      .single();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

    const orderId = order!.id as string;

    // Generate a short, human-friendly order code for this admin-created order.
    try {
      const { error: scErr } = await supabase.rpc('generate_order_short_code', { p_order_id: orderId });
      if (scErr) {
        console.error('[admin/orders/create] short code RPC error', scErr.message);
      }
    } catch (e) {
      console.error('[admin/orders/create] short code generation failed', e);
    }

    // Insert items with locked prices
    const rows = items.map((it) => ({
      order_id: orderId,
      variant_id: it.variant_id,
      qty: it.qty,
      price: priceById.get(it.variant_id)!,
    }));
    const { error: oiErr } = await supabase.from('order_items').insert(rows);
    if (oiErr) return NextResponse.json({ error: oiErr.message }, { status: 500 });

    // Reserve inventory: increment inventory.reserved for each variant
    for (const it of items) {
      const { error: invErr } = await supabase
        .from('inventory')
        .update({ reserved: (null as any) }) // placeholder; will be set via increment below
        .eq('variant_id', it.variant_id);
      // We cannot do atomic increment with the JS client directly; perform via RPC or a single UPDATE with expression if exposed.
      // Workaround: fetch current and write back (two-step) — acceptable for admin manual entry volume.
      const { data: cur } = await supabase
        .from('inventory')
        .select('reserved')
        .eq('variant_id', it.variant_id)
        .maybeSingle();
      const current = Number(cur?.reserved ?? 0);
      await supabase.from('inventory').update({ reserved: current + it.qty }).eq('variant_id', it.variant_id);
      if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order_id: orderId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
