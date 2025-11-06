"use client";

import React from "react";

export default function ReviewSummary({ productId }: { productId: string }) {
  const [avg, setAvg] = React.useState<number>(0);
  const [count, setCount] = React.useState<number>(0);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/reviews?product_id=${productId}&limit=0`);
        const json = await res.json();
        if (alive && json?.ok) {
          setAvg(Number(json.summary?.avg || 0));
          setCount(Number(json.summary?.count || 0));
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [productId]);

  const stars = (n: number) => (
    <span aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < Math.round(n) ? '#f59e0b' : '#e5e7eb' }}>★</span>
      ))}
    </span>
  );

  return (
    <div className="mt-3 text-sm text-gray-700 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {stars(avg)}
        <span>{count > 0 ? `${avg.toFixed(1)} (${count})` : 'No reviews yet'}</span>
      </div>
      <a href="#reviews" className="text-blue-600 hover:underline">Read reviews</a>
    </div>
  );
}
