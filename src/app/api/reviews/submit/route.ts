import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

function sha256LowerTrim(input?: string | null) {
  const v = (input || "").trim().toLowerCase();
  if (!v) return undefined;
  return crypto.createHash("sha256").update(v).digest("hex");
}

function normalizePhonePK(phone?: string | null) {
  if (!phone) return undefined;
  let p = phone.trim();
  // keep + and digits
  p = p.replace(/[^\d+]/g, "");
  // if starts with 0, convert to +92
  if (/^0\d{10}$/.test(p)) {
    p = "+92" + p.slice(1);
  }
  // if missing +, assume already has country code
  if (!p.startsWith("+")) {
    p = "+" + p;
  }
  return p;
}

function digitsOnly(phone?: string | null) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

export async function POST(req: Request) {
  try {
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "server_not_configured" }, { status: 500 });
    }
    const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const product_id: string = body?.product_id;
    const variant_id: string | undefined = body?.variant_id || undefined;
    const rating: number = Number(body?.rating);
    const title: string | undefined = body?.title?.slice?.(0, 60) || undefined;
    const text: string = String(body?.body || "");
    const author_name: string | undefined = body?.author_name?.slice?.(0, 60) || undefined;
    const phoneRaw: string = String(body?.phone || "");
    const images: string[] = Array.isArray(body?.images) ? body.images.slice(0, 2) : [];

    if (!product_id) return NextResponse.json({ ok: false, error: "missing_product" }, { status: 400 });
    if (!rating || rating < 1 || rating > 5) return NextResponse.json({ ok: false, error: "invalid_rating" }, { status: 400 });
    if (text.length < 20 || text.length > 800) return NextResponse.json({ ok: false, error: "invalid_length" }, { status: 400 });
    const phone = normalizePhonePK(phoneRaw);
    if (!phone) return NextResponse.json({ ok: false, error: "phone_required" }, { status: 400 });

    // Match shipped order for this product and phone (allow formatting differences)
    const submittedDigits = digitsOnly(phone);
    let matchedOrderId: string | null = null;

    // Gather shipped orders and match by last-10 digits in memory to avoid relying on SQL regex support here
    const { data: shippedOrders } = await supabase
      .from('orders')
      .select('id, phone, status')
      .eq('status', 'shipped')
      .order('created_at', { ascending: false })
      .limit(500);

    const candidateOrderIds: string[] = [];
    for (const o of shippedOrders || []) {
      const ord = o as any;
      const ordDigits = digitsOnly(ord?.phone || '');
      if (ordDigits === submittedDigits || (ordDigits.endsWith(submittedDigits.slice(-10)) && submittedDigits.length >= 10)) {
        candidateOrderIds.push(ord.id as string);
      }
    }

    if (candidateOrderIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_shipped_orders_for_phone' }, { status: 403 });
    }

    // Fetch order lines/items for those orders
    const [webLinesRes, adminItemsRes] = await Promise.all([
      supabase.from('order_lines').select('order_id, variant_id').in('order_id', candidateOrderIds).limit(1000),
      supabase.from('order_items').select('order_id, variant_id').in('order_id', candidateOrderIds).limit(1000),
    ]);

    const webLines = (webLinesRes.data || []) as any[];
    const adminItems = (adminItemsRes.data || []) as any[];
    const all = [...webLines, ...adminItems];
    const variantIds = Array.from(new Set(all.map(r => (r as any).variant_id).filter(Boolean)));

    if (variantIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_items_for_orders' }, { status: 403 });
    }

    // Map variants to product_ids
    const { data: vrows } = await supabase
      .from('variants')
      .select('id, product_id')
      .in('id', variantIds)
      .limit(1000);
    const vById = new Map<string, string>();
    for (const v of vrows || []) vById.set((v as any).id, (v as any).product_id);

    // Find a candidate with same product_id
    for (const r of all) {
      const pid = vById.get((r as any).variant_id);
      if (pid && pid === product_id) {
        matchedOrderId = (r as any).order_id as string;
        break;
      }
    }

    if (!matchedOrderId) {
      return NextResponse.json({ ok: false, error: 'no_shipped_order_for_this_product' }, { status: 403 });
    }

    const phone_hash = sha256LowerTrim(phone);

    // Insert review (pending)
    const { data: ins, error: insErr } = await supabase
      .from("product_reviews")
      .insert({
        product_id,
        variant_id: variant_id || null,
        rating,
        title: title || null,
        body: text,
        author_name: author_name || null,
        phone_hash,
        order_id: matchedOrderId,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

    // Attach image URLs if provided (assumes already uploaded somewhere public)
    for (const url of images) {
      if (!url || typeof url !== "string") continue;
      await supabase.from("product_review_media").insert({ review_id: (ins as any).id, url });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown_error" }, { status: 500 });
  }
}
