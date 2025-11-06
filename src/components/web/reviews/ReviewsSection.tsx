"use client";

import React from "react";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  author_name: string | null;
  verified: boolean;
  created_at: string;
  images: string[];
};

export default function ReviewsSection({ productId }: { productId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [avg, setAvg] = React.useState<number>(0);
  const [count, setCount] = React.useState<number>(0);
  const [page, setPage] = React.useState(0);

  // form state
  const [rating, setRating] = React.useState<number>(5);
  const [title, setTitle] = React.useState<string>("");
  const [body, setBody] = React.useState<string>("");
  const [name, setName] = React.useState<string>("");
  const [phone, setPhone] = React.useState<string>("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?product_id=${productId}&limit=10&offset=${p*10}`);
      const json = await res.json();
      if (json?.ok) {
        if (p === 0) setReviews(json.reviews || []);
        else setReviews((r) => [...r, ...(json.reviews || [])]);
        setAvg(json.summary?.avg || 0);
        setCount(json.summary?.count || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [productId]);

  React.useEffect(() => { load(0); }, [load]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = Array.from(e.target.files || []).slice(0, 2);
    setFiles(fl);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      let urls: string[] = [];
      if (files.length) {
        const form = new FormData();
        files.forEach((f, i) => form.append(`file${i+1}`, f));
        const up = await fetch('/api/reviews/upload', { method: 'POST', body: form });
        const upj = await up.json();
        if (!up.ok || !upj?.ok) throw new Error(upj?.error || 'upload_failed');
        urls = upj.urls || [];
      }
      const res = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          rating: Number(rating),
          title: title || undefined,
          body,
          author_name: name || undefined,
          phone,
          images: urls,
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'submit_failed');
      setMsg('Thanks! Your review is pending moderation.');
      setRating(5); setTitle(''); setBody(''); setName(''); setPhone(''); setFiles([]);
      // reload summary
      load(0);
    } catch (err: any) {
      setMsg(err?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const stars = (n: number) => (
    <span aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < Math.round(n) ? '#f59e0b' : '#e5e7eb' }}>★</span>
      ))}
    </span>
  );

  return (
    <div id="reviews" className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">Customer Reviews</div>
        <div className="text-sm text-gray-600 flex items-center gap-2">{stars(avg)} <span>{avg.toFixed(1)} ({count})</span></div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading && <div className="text-sm text-gray-500">Loading...</div>}
        {!loading && reviews.length === 0 && <div className="text-sm text-gray-500">No reviews yet.</div>}
        {reviews.map((r) => (
          <div key={r.id} className="border rounded-lg p-3 shadow-sm bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm text-gray-900">{r.author_name || 'Verified buyer'}</div>
              <div className="text-sm">{stars(r.rating)}</div>
            </div>
            {r.title && <div className="mt-1 font-semibold text-gray-900">{r.title}</div>}
            <div className="mt-1 text-sm whitespace-pre-wrap text-gray-700 leading-6">{r.body}</div>
            {r.images?.length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {r.images.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt="review" className="w-20 h-20 object-cover rounded-md border" />
                ))}
              </div>
            )}
            {r.verified && <div className="mt-1 text-xs text-emerald-700">Verified buyer</div>}
          </div>
        ))}
      </div>

      {reviews.length < count && (
        <button onClick={() => { const n = page + 1; setPage(n); load(n); }} className="px-3 py-2 rounded border text-sm">Load more</button>
      )}

      {/* CTA to open modal */}
      <div className="pt-1">
        <button onClick={()=>setOpen(true)} className="px-4 py-2 rounded-md border bg-white hover:bg-gray-50 text-gray-900 shadow-sm">Write a review</button>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={()=>!submitting && setOpen(false)} />
          <div className="absolute inset-x-4 sm:inset-x-auto sm:right-6 top-[10%] sm:top-24 bg-white border rounded-xl shadow-2xl max-w-xl mx-auto p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-base font-semibold">Write a review</div>
                <div className="text-xs text-gray-600">Only verified purchasers can write a review. We will verify your phone against shipped orders.</div>
              </div>
              <button onClick={()=>!submitting && setOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            {msg && <div className={`text-sm ${submitting ? 'text-gray-600' : 'text-emerald-700'}`}>{msg}</div>}
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-sm">Rating</label>
                <select value={rating} onChange={(e)=>setRating(Number(e.target.value))} className="border rounded-md px-2 py-1">
                  {[5,4,3,2,1].map((n)=> (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div>
                <input value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={60} placeholder="Title (optional)" className="border rounded-md px-3 py-2 w-full" />
              </div>
              <div>
                <textarea value={body} onChange={(e)=>setBody(e.target.value)} minLength={20} maxLength={800} placeholder="Your review (20–800 characters)" className="border rounded-md px-3 py-2 w-full h-28" />
              </div>
              <div className="flex gap-2">
                <input value={name} onChange={(e)=>setName(e.target.value)} maxLength={60} placeholder="Your name (optional)" className="border rounded-md px-3 py-2 w-full" />
                <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="Phone (required to verify)" className="border rounded-md px-3 py-2 w-full" />
              </div>
              <div>
                <input type="file" multiple accept="image/*" onChange={onFileChange} />
                <div className="text-xs text-gray-500">Up to 2 images · 2MB each</div>
              </div>
              <div className="flex items-center gap-2">
                <button disabled={submitting} className={`px-4 py-2 rounded-md text-white ${submitting ? 'bg-gray-400' : 'bg-black hover:bg-gray-900'}`}>{submitting ? 'Submitting…' : 'Submit review'}</button>
                <button type="button" onClick={()=>!submitting && setOpen(false)} className="px-3 py-2 rounded-md border">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
