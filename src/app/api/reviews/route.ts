import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

export async function GET(req: Request) {
  try {
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "server_not_configured" }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const product_id = searchParams.get("product_id");
    const limit = Math.min(Number(searchParams.get("limit") || 10), 50);
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

    if (!product_id) return NextResponse.json({ ok: false, error: "missing_product_id" }, { status: 400 });

    const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Summary
    const { data: agg } = await supabase
      .from("product_reviews")
      .select("rating", { count: "exact" })
      .eq("product_id", product_id)
      .eq("status", "approved");

    const count = (agg || []).length;
    const avg = count ? (agg as any[]).reduce((s, r) => s + Number((r as any).rating || 0), 0) / count : 0;

    // Reviews with media
    const { data: rows } = await supabase
      .from("product_reviews")
      .select("id, rating, title, body, author_name, created_at, order_id")
      .eq("product_id", product_id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const ids = (rows || []).map((r: any) => r.id);
    const mediaByReview = new Map<string, string[]>();
    if (ids.length) {
      const { data: media } = await supabase
        .from("product_review_media")
        .select("review_id, url")
        .in("review_id", ids);
      for (const m of media || []) {
        const rid = (m as any).review_id as string;
        const url = (m as any).url as string;
        if (!mediaByReview.has(rid)) mediaByReview.set(rid, []);
        mediaByReview.get(rid)!.push(url);
      }
    }

    const reviews = (rows || []).map((r: any) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author_name: r.author_name || null,
      verified: !!r.order_id,
      created_at: r.created_at,
      images: mediaByReview.get(r.id) || [],
    }));

    return NextResponse.json({ ok: true, summary: { count, avg }, reviews });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown_error" }, { status: 500 });
  }
}
