"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function ShippingIndexPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [pid, setPid] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabaseBrowser
        .from("products")
        .select("id, name, slug")
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      setProducts((data || []) as any);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Shipping</h1>
        <p className="text-sm text-gray-600">Select a product to configure shipping settings and rules.</p>

        <div className="space-y-3 border rounded p-4">
        <label className="block text-sm font-medium">Product</label>
        <select
          className="border rounded px-3 py-2 w-full"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            disabled={!pid}
            onClick={() => pid && router.push(`/admin/shipping/${pid}`)}
          >
            Set shipping Rules
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
        <div className="text-xs text-gray-500">
          Tip: Configure fallback first (e.g., flat per order), then add province/city rules to override when needed.
        </div>
      </div>

      {/* Help panel */}
      <aside className="hidden lg:block">
        <div className="border rounded p-4 bg-white shadow-sm space-y-3">
          <h2 className="font-medium">Steps</h2>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Select a product from the dropdown.</li>
            <li>Click <em>Set shipping Rules</em> to open the editor.</li>
            <li>In the editor: set a fallback (default), then add province rules. Add city rules only if needed.</li>
          </ol>
          <h3 className="font-medium mt-2">How rates are used</h3>
          <ul className="text-sm space-y-1">
            <li>City rule → Province rule → Fallback.</li>
            <li>Free shipping for orders over (PKR) overrides all rates.</li>
            <li>COD fee is appended at the end if configured.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
