import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "server_not_configured" }, { status: 500 });
    }
    const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const form = await req.formData();
    const files: File[] = [];
    // Collect inputs named file1, file2 ... without iterating entries()
    const keys = Array.from(form.keys());
    for (const k of keys) {
      if (!k.startsWith('file')) continue;
      const all = form.getAll(k);
      for (const v of all) {
        if (v instanceof File) files.push(v);
      }
    }
    if (!files.length) return NextResponse.json({ ok: false, error: 'no_files' }, { status: 400 });
    if (files.length > 2) return NextResponse.json({ ok: false, error: 'too_many_files' }, { status: 400 });

    const uploadedUrls: string[] = [];
    for (const f of files) {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      const allowed = ['jpg','jpeg','png','webp'];
      if (!allowed.includes(ext)) return NextResponse.json({ ok: false, error: 'invalid_type' }, { status: 400 });
      if (f.size > 2 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
      const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const arrayBuffer = await f.arrayBuffer();
      const { error: upErr } = await supabase.storage.from('reviews').upload(path, arrayBuffer, {
        contentType: f.type || `image/${ext}`,
        upsert: false,
      });
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      const { data: pub } = supabase.storage.from('reviews').getPublicUrl(path);
      uploadedUrls.push(pub.publicUrl);
    }

    return NextResponse.json({ ok: true, urls: uploadedUrls });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
