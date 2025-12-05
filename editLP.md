# Edit LP – Per‑Product Social & Contact Setup

This document explains how Afal Store product landing pages (LPs) are controlled from the admin, and how per‑product social media + contact information should work. The goal is that **all LP content is editable from the admin**, without needing a code deploy.

---

## 1. Current LP model (high level)

- Each product in Supabase table `public.products` has:
  - `id`, `name`, `slug`, `description_en`, `description_ur`, `logo_url`, `active`, etc.
- The admin UI under `/admin/products` lets you:
  - Add products.
  - Edit texts (EN/UR), logo, checkout extras, media, specs, sections, Meta Pixel, etc.
- For every active product, the customer‑facing LP is at:
  - Route: `/lp/[slug]`
  - File: `src/app/lp/[slug]/page.tsx`
- The LP queries Supabase **at request time** using `getSupabaseServerClient()` and renders:
  - Top gallery (`product_media`).
  - Buy panel using variants, options, inventory views.
  - Bilingual description (`description_en`, `description_ur`).
  - Specs from `product_specs`.
  - Long sections from `product_sections`.
  - Reviews, Meta Pixel view event, etc.

Result: when admins change product data in Supabase via the admin UI, LPs update **without any Git push or redeploy**.

---

## 2. New requirement – Per‑product social & contact

We want each product to be able to show **its own social media and contact info** on the LP, controlled from the Edit Product page.

For every product, admins should be able to set:

- **Facebook page URL** – often unique per product or campaign.
- **Instagram URL (optional)**.
- **WhatsApp link (optional)** – e.g. `https://wa.me/92XXXXXXXXXX`.
- **Contact email (optional)** – default could be brand email.
- **Contact phone (optional)**.

Behavior:

- Admins edit these fields in a dedicated **“Social media & contact”** section on the Edit Product page.
- Values are stored in the `products` row for that product.
- The LP page (`/lp/[slug]`) reads these fields and renders a **Connect & contact** block.
- If a field is empty, its link/line is hidden.
- No code change or deploy is needed once this wiring exists; admins manage everything via the dashboard.

---

## 3. Supabase schema changes

We extend the existing `public.products` table with five new columns.

### 3.1 SQL run in Supabase

```sql
alter table public.products
  add column fb_page_url   text,
  add column instagram_url text,
  add column whatsapp_url  text,
  add column contact_email text,
  add column contact_phone text;
```

Notes:

- All columns are nullable.
- Existing RLS policies on `products` continue to apply.
- No additional tables are required; everything is per‑product.

---

## 4. Admin – Edit Product wiring

Admin file: `src/app/admin/products/[id]/page.tsx`

### 4.1 Type and state

Extend the local `Product` type with the new fields:

```ts
type Product = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  description_en: string | null;
  description_ur: string | null;
  logo_url: string | null;
  daraz_enabled?: boolean;
  daraz_url?: string | null;
  chat_enabled?: boolean;
  chat_facebook_url?: string | null;
  chat_instagram_url?: string | null;
  special_message?: string | null;
  daraz_trust_line?: boolean;
  fb_page_url?: string | null;
  instagram_url?: string | null;
  whatsapp_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};
```

Local React state to hold these values:

```ts
const [fbPageUrl, setFbPageUrl] = useState<string>('');
const [instagramUrl, setInstagramUrl] = useState<string>('');
const [whatsappUrl, setWhatsappUrl] = useState<string>('');
const [contactEmail, setContactEmail] = useState<string>('');
const [contactPhone, setContactPhone] = useState<string>('');
```

Include them in `initialBasics` so dirty‑checking and reset work:

```ts
const [initialBasics, setInitialBasics] = useState<{
  name: string;
  slug: string;
  active: boolean;
  descriptionEn: string;
  descriptionUr: string;
  logoUrl: string;
  darazEnabled: boolean;
  darazUrl: string;
  darazTrustLine: boolean;
  chatEnabled: boolean;
  chatFacebookUrl: string;
  chatInstagramUrl: string;
  specialMessage: string;
  fbPageUrl: string;
  instagramUrl: string;
  whatsappUrl: string;
  contactEmail: string;
  contactPhone: string;
} | null>(null);
```

### 4.2 Loading from Supabase

Product query (`useEffect` that loads `p`):

```ts
const { data: p, error: pErr } = await supabaseBrowser
  .from('products')
  .select(
    'id, name, slug, active, description_en, description_ur, logo_url, ' +
    'daraz_enabled, daraz_url, daraz_trust_line, chat_enabled, ' +
    'chat_facebook_url, chat_instagram_url, special_message, ' +
    'fb_page_url, instagram_url, whatsapp_url, contact_email, contact_phone'
  )
  .eq('id', params.id)
  .maybeSingle();
```

After loading, map into state:

```ts
setFbPageUrl((p as any).fb_page_url || '');
setInstagramUrl((p as any).instagram_url || '');
setWhatsappUrl((p as any).whatsapp_url || '');
setContactEmail((p as any).contact_email || '');
setContactPhone((p as any).contact_phone || '');

setInitialBasics({
  ...,
  specialMessage: (p as any).special_message || '',
  fbPageUrl: (p as any).fb_page_url || '',
  instagramUrl: (p as any).instagram_url || '',
  whatsappUrl: (p as any).whatsapp_url || '',
  contactEmail: (p as any).contact_email || '',
  contactPhone: (p as any).contact_phone || '',
});
```

Include these fields in `basicsDirty` comparison and in the reset function `discardChanges()` so changes are tracked and can be reverted.

### 4.3 Saving to Supabase

In `saveBasics` and in the unified `saveAllEdits`, extend the `products.update` payload:

```ts
await supabaseBrowser
  .from('products')
  .update({
    name,
    slug,
    active,
    description_en: descriptionEn || null,
    description_ur: descriptionUr || null,
    logo_url: logoUrl || null,
    daraz_enabled: darazEnabled,
    daraz_url: darazEnabled ? (darazUrl || null) : null,
    daraz_trust_line: darazEnabled ? darazTrustLine : false,
    chat_enabled: chatEnabled,
    chat_facebook_url: chatEnabled ? (chatFacebookUrl || null) : null,
    chat_instagram_url: chatEnabled ? (chatInstagramUrl || null) : null,
    special_message: specialMessage || null,
    fb_page_url: fbPageUrl || null,
    instagram_url: instagramUrl || null,
    whatsapp_url: whatsappUrl || null,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
  })
  .eq('id', params.id);
```

### 4.4 Admin UI section

Add a new section under **Checkout Extras** on the Edit Product page:

```tsx
{/* Social media & contact */}
<section className="space-y-4 border rounded p-4">
  <h2 className="font-medium">Social media &amp; contact</h2>
  <div className="space-y-3">
    <div>
      <label className="block text-sm font-medium">Facebook page URL</label>
      <input
        value={fbPageUrl}
        onChange={(e) => setFbPageUrl(e.target.value)}
        placeholder="https://facebook.com/your-product-page"
        className="mt-1 w-full border rounded px-3 py-2"
      />
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium">Instagram URL (optional)</label>
        <input
          value={instagramUrl}
          onChange={(e) => setInstagramUrl(e.target.value)}
          placeholder="https://instagram.com/your-profile"
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">WhatsApp link (optional)</label>
        <input
          value={whatsappUrl}
          onChange={(e) => setWhatsappUrl(e.target.value)}
          placeholder="https://wa.me/92XXXXXXXXXX"
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>
    </div>
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium">Contact email (optional)</label>
        <input
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="support@example.com"
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Contact phone (optional)</label>
        <input
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="03xx-xxxxxxx"
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>
    </div>
  </div>
  <div>
    <button
      onClick={saveBasics}
      disabled={saving}
      className={`px-4 py-2 rounded text-white ${
        saving ? 'bg-gray-400' : 'bg-black hover:bg-gray-800'
      }`}
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  </div>
</section>
```

Admins use this section to configure social + contact per product.

---

## 5. LP page wiring

LP file: `src/app/lp/[slug]/page.tsx`

### 5.1 Fetch product with social/contact fields

In `fetchLpData(slug)`, the product query should include the new columns:

```ts
const { data: product } = await supabase
  .from('products')
  .select(
    'id, name, slug, description_en, description_ur, active, logo_url, ' +
    'daraz_enabled, daraz_url, daraz_trust_line, chat_enabled, ' +
    'chat_facebook_url, chat_instagram_url, special_message, ' +
    'fb_page_url, instagram_url, whatsapp_url, contact_email, contact_phone'
  )
  .eq('slug', slug)
  .eq('active', true)
  .maybeSingle();
```

The rest of `fetchLpData` (media, variants, matrix, specs, sections, pixel config) continues as before.

### 5.2 Render social/contact block on the LP

In the main JSX, inside the **left column** (same column as descriptions, specs, sections, reviews), render a block only when at least one field is present.

Example placement: after Reviews and before the mobile footer spacer.

```tsx
{/* Reviews */}
<div className="pt-4">
  <ReviewsSection productId={product.id} />
</div>

{/* Social media & contact */}
{(product.fb_page_url ||
  product.instagram_url ||
  product.whatsapp_url ||
  product.contact_email ||
  product.contact_phone) && (
  <section className="space-y-3">
    <h2 className="text-lg font-medium">Connect &amp; contact</h2>
    <div className="flex flex-wrap gap-3 text-sm">
      {product.fb_page_url && (
        <a
          href={product.fb_page_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-1.5 rounded border border-blue-600 text-blue-600 hover:bg-blue-50"
        >
          Facebook page
        </a>
      )}
      {product.instagram_url && (
        <a
          href={product.instagram_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-1.5 rounded border border-pink-500 text-pink-500 hover:bg-pink-50"
        >
          Instagram
        </a>
      )}
      {product.whatsapp_url && (
        <a
          href={product.whatsapp_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-1.5 rounded border border-green-600 text-green-600 hover:bg-green-50"
        >
          Chat on WhatsApp
        </a>
      )}
    </div>
    {(product.contact_email || product.contact_phone) && (
      <div className="text-sm text-gray-700 space-y-1">
        {product.contact_email && (
          <div>
            Email:{' '}
            <a
              href={`mailto:${product.contact_email as string}`}
              className="text-blue-600 hover:underline break-all"
            >
              {product.contact_email as string}
            </a>
          </div>
        )}
        {product.contact_phone && <div>Phone: {product.contact_phone as string}</div>}
      </div>
    )}
  </section>
)}

{/* Mobile-only footer spacer with small text */}
<div className="block lg:hidden text-center text-xs text-gray-400 py-28">afalstore</div>
```

With this wiring in place:

- Editing social/contact fields in the admin immediately updates the corresponding LP.
- Each product can have its own Facebook page and contact details.
- If a given field is left empty, it is simply not shown on the LP.
