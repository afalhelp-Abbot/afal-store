"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import HelpTip from '@/components/admin/HelpTip';
import { slugify } from '@/lib/slugify';

export default function NewProductPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [active, setActive] = useState(false);
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionUr, setDescriptionUr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoSlug = () => {
    const s = slugify(name);
    setSlug(s);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabaseBrowser
        .from('products')
        .insert({ name, slug, active, description_en: descriptionEn || null, description_ur: descriptionUr || null })
        .select('id, slug')
        .single();
      if (error) throw error;
      router.push(`/admin/products/${data!.id}`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to create product';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Add Product</h1>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="block font-medium">Name <HelpTip>Customer-facing name shown on the landing page.</HelpTip></label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" required />
        </div>

        <div>
          <label className="block font-medium">Slug <HelpTip>Short name used in the URL, e.g. air-tag. Must be unique.</HelpTip></label>
          <div className="flex gap-2 items-center">
            <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className="mt-1 flex-1 border rounded px-3 py-2" required />
            <button type="button" onClick={autoSlug} className="px-3 py-2 rounded border">Auto</button>
          </div>
          <p className="text-xs text-gray-600 mt-1">URL will be /lp/{'{slug}'}</p>
        </div>

        <div className="flex items-center gap-2">
          <input id="active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <label htmlFor="active" className="font-medium">Active</label>
          <HelpTip>Controls whether the product is published and visible on its landing page.</HelpTip>
        </div>

        <div>
          <label className="block font-medium">Description (English) <HelpTip>Optional. Shown under the gallery on the LP. Leave empty to omit.</HelpTip></label>
          <textarea value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} rows={5} className="mt-1 w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="block font-medium">Description (Urdu) <HelpTip>Optional. Shown under the gallery on the LP when provided.</HelpTip></label>
          <textarea value={descriptionUr} onChange={(e) => setDescriptionUr(e.target.value)} rows={5} className="mt-1 w-full border rounded px-3 py-2" />
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'}`}>{saving ? 'Saving...' : 'Save & Continue'}</button>
          <button type="button" className="px-4 py-2 rounded border" onClick={() => history.back()}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
