import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/*
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
  "utm"?: {
    "source"?: string,
    "medium"?: string,
    "campaign"?: string
  },
  "items": [
    { "variant_id": string, "qty": number }
  ]
}
*/

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();

    // Basic validation
    const items = (body?.items ?? []) as Array<{ variant_id: string; qty: number }>;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }
    const customer = body?.customer || {};
    if (!customer.name || !customer.phone || !customer.address || !customer.city) {
      return NextResponse.json({ error: 'Missing required customer fields' }, { status: 400 });
    }

    // Fetch variant prices to lock in price at order time
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
        return NextResponse.json({ error: 'One or more variants are inactive' }, { status: 400 });
      }
      // @ts-ignore
      priceById.set(v.id, Number(v.price));
    }
    // Ensure all variants exist
    for (const it of items) {
      if (!priceById.has(it.variant_id)) {
        return NextResponse.json({ error: `Variant not found: ${it.variant_id}` }, { status: 400 });
      }
      if (!Number.isFinite(it.qty) || it.qty <= 0) {
        return NextResponse.json({ error: `Invalid qty for variant ${it.variant_id}` }, { status: 400 });
      }
    }

    // Insert order header
    const { data: orderIns, error: oErr } = await supabase
      .from('orders')
      .insert({
        status: 'pending',
        customer_name: customer.name,
        // email column should exist; if not, add it in DB: ALTER TABLE orders ADD COLUMN IF NOT EXISTS email text;
        email: customer.email ?? null,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        province_code: customer.province_code ?? null,
        utm_source: body?.utm?.source ?? null,
        utm_medium: body?.utm?.medium ?? null,
        utm_campaign: body?.utm?.campaign ?? null,
      })
      .select('id')
      .single();

    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    const orderId = orderIns!.id as string;

    // Build order_items payload with locked prices
    const itemsRows = items.map((it) => ({
      order_id: orderId,
      variant_id: it.variant_id,
      qty: it.qty,
      price: priceById.get(it.variant_id)!,
    }));

    const { error: oiErr } = await supabase.from('order_items').insert(itemsRows);
    if (oiErr) return NextResponse.json({ error: oiErr.message }, { status: 500 });

    // Optional: reserve inventory here via RPC 'adjust_stock' or by updating 'reserved'
    // Skipped for now; we will finalize reservation logic after end-to-end verification.

    return NextResponse.json({ ok: true, order_id: orderId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
