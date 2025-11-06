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

    // Match shipped order for this phone and product
    // orders (status='shipped', phone=phone) -> order_items -> variants(product_id)
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "shipped")
      .eq("phone", phone)
      .limit(50);

    let matchedOrderId: string | null = null;
    if (orders && orders.length) {
      const orderIds = orders.map((o: any) => o.id);
      const { data: lines } = await supabase
        .from("order_items")
        .select("order_id, variants!inner(product_id)")
        .in("order_id", orderIds);
      for (const l of lines || []) {
        const pid = (l as any)?.variants?.product_id as string | undefined;
        if (pid === product_id) { matchedOrderId = (l as any).order_id as string; break; }
      }
    }

    if (!matchedOrderId) {
      // reject silently or return a specific error
      return NextResponse.json({ ok: false, error: "no_shipped_order_found" }, { status: 403 });
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
