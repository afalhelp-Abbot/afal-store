# Landing Page (LP) Documentation

This document defines the LP layout, data contracts, and the Admin “Add Product” experience for the Pakistan store. It replaces previous notes.

## Goals
- Maintain the current LP layout and UX: left media viewer with vertical thumbnail rail; sticky Buy panel on the right; description below the gallery.
- Admin should allow adding a product (Shopify-style) and immediately power an LP at `/lp/[slug]` without additional coding.

## Route
- Path: `/lp/[slug]`
- Page: `src/app/lp/[slug]/page.tsx`

### Slug / Shortname Behavior
- Admin includes a shortname field (e.g., `air-tag`, `maternity-belt`).
- By default we generate a slug from the Name and prefill Shortname; it is editable.
- Slug must be unique; collisions result in an inline validation error.
- The LP URL uses this slug: `/lp/[slug]`.
- Publishing does not require Urdu/EN descriptions or specs — missing content simply does not render.

## LP Layout (as-is, retained)
- Left column: `ImageGallery` with vertical thumbnail rail, then content sections (Highlights, EN/UR descriptions, Specs).
- Right column: `BuyPanel` sticky at `lg` breakpoint with color chips, price, availability, and Start Order.
- Evidence:
  - Gallery component: `src/components/web/product/ImageGallery.tsx` (thumb rail lines 60–73; hero viewer lines 90–115; video lines 117–123; thumbnail uses `thumb ?? src` lines 75–81, 160–166).
  - LP uses this gallery: `src/app/lp/[slug]/page.tsx` passes a `MediaItem[]` (lines 109–121) and renders BuyPanel sticky (lines 179–189).

## Data Model (Supabase)
- Products: `products(id, name, slug, description_en?, description_ur?, active)`
- Variants: `variants(id, product_id, sku, price, active)`
- Inventory: `inventory(variant_id, stock_on_hand, reserved)` → `available = on_hand - reserved`
- Options/Colors:
  - `option_types(id, name)` — must include row where `name = 'Color'`.
  - `product_options(product_id, option_type_id)`
  - `variant_option_values(variant_id, option_value_id)`
- Orders: `orders(...)`, `order_items(...)` (created by the LP drawer)
- Evidence in code:
  - Server fetch & aggregation in `page.tsx` (products lines 10–15; variants 18–23; inventory 26–36; color mapping 39–57; per-color aggregation 60–75).
  - Orders API: `src/app/api/orders/create/route.ts` inserts header and items (lines 69–83, 91–99).
  
  ## Admin – Add/Edit Product (Spec)
- Basics
  - Name (required) → `products.name`
  - Slug (auto from name, editable) → `products.slug`
  - Active (publish toggle) → `products.active`
  - Descriptions (both optional)
{{ ... }}
- Options & Variants
  - Option Types to include at minimum: `Color` (others like Size can be added later).
  - Option Values per product (e.g., Black, Pink) → `option_values`.
  - Create variants with `sku`, `price`, `active`, and link to selected option values via `variant_option_values`.

  - Inventory
    - Per-variant `stock_on_hand` entry. `reserved` is managed by the order flow; LP shows `available = on_hand - reserved`.

## Product Specifications (Flexible Key Attributes)
- Purpose
  - Render Alibaba-style Key Attributes tables that vary per product.
- Data Model (new)
  - `product_specs`:
    - `product_id` (uuid)
    - `group` (text, optional) — e.g., "Key attributes", "Packaging and delivery" (ENABLED from day one)
    - `label` (text) — e.g., "Operating System"
    - `value` (text) — e.g., "Android"
    - `sort` (int) — display order within the group
    - `lang` (text/enum) — support both `en` and `ur` from day one; if a language row is absent, that language block is omitted
- Admin UX
  - Inline add/remove rows with fields: Group, Label, Value, Sort.
  - Drag to reorder within group (updates `sort`).
  - Empty list ⇒ specs section is omitted on LP.
- LP Rendering
  - Group rows by `group` and render each as a 2-column table: Label | Value.
  - Replaces the static table in `src/app/lp/[slug]/page.tsx` (current lines 165–175).

## Bottom Content Sections (Long-form media/content)
- Purpose
  - Allow stacking additional images, galleries, videos, or rich text below the main description — optionally reusing top media.
- Data Model (new)
  - `product_sections`:
    - `product_id` (uuid)
    - `type` (enum: `image` | `gallery` | `video` | `rich_text`) — ALL FOUR types are enabled
    - `title` (text, optional)
    - `body` (text, optional; used for `rich_text`)
    - `media_refs` (jsonb; array of media IDs/URLs for `image`/`gallery`/`video`)
    - `sort` (int)
- Admin UX
  - Add section → choose type → pick existing media (reuse) or upload new; set title/body as needed; drag to reorder.
  - No sections ⇒ bottom content area is omitted.
- LP Rendering
  - Render each section in `sort` order beneath the description areas and before the footer.

  ## LP Rendering Rules (unchanged)
  - Colors: derived from `variant_option_values` → `option_values` where `option_types.name = 'Color'`. If missing, LP falls back to SKU segment or `"Default"`.
  - Price per color: lowest variant price for that color.
  - Availability per color: sum of availability across variants of that color.
  - BuyPanel disables color chips when availability ≤ 0 and shows a Low‑stock badge when 1–5.

## Orders (unchanged)
- Drawer posts to `POST /api/orders/create` with `{ customer, utm, items }`.
- API locks variant prices at order time and inserts `orders` and `order_items`.
- UTM captured on LP mount via `UTMCapture` and `src/lib/utm.ts`.
## Storage (Decision Pending; Recommendation)
- Recommendation: use Supabase Storage for admin uploads (public read bucket). Reasons: admin-friendly uploads, CDN URLs, no rebuilds for new assets, easy targeted deletion.
- Alternative `/public` is not recommended for user-driven uploads (requires rebuild; hard to delete per item).

## Product Deletion (Decision Pending)
- Proposed policy:
  - Default: Soft delete (or `active = false`) to preserve history when orders exist.
  - Optional: Hard delete when safe (no orders): remove product, variants, option links, inventory, and delete media files from Storage.
- Final choice TBD; both options supported by Admin UI.

## RLS & Access (to verify)
- LP requires anonymous read access (via SSR anon client) to: `products`, `variants`, `inventory`, `option_types`, `option_values`, `variant_option_values`.
- Orders API requires insert access to: `orders`, `order_items`.

## Backlog (Next Changes to Implement)
1) Replace hard-coded media in `page.tsx` with DB/Storage-backed media from Admin.
2) Replace hard-coded bilingual text with `description_en` / `description_ur` fields.
3) Admin screens: Product list, Add product, Edit product, Variant & Inventory manager, Media manager.
4) Analytics: LP view, Start Order, Order success events.
5) Performance: add ISR/revalidate policy for LP data.

## How to Test
- Create a product in Admin with name, at least one color/variant, and images.
- Verify `/lp/[slug]` renders:
  - Left gallery with your thumbnail rail order and hero image/video.
  - Right BuyPanel with colors, price, and availability.
  - Descriptions only for the languages you filled in.
