# Landing Page (LP) Documentation

This document explains the purpose, routing, data flow, implementation status, and next steps for the per-product Landing Page used for paid traffic (Meta, etc.). Use it as a quick refresher before resuming work.

## Purpose
- High-conversion, content-rich page for a single product (e.g., Android Tag), used by ads.
- Shows real price and availability per color, with a sticky Buy panel.
- Starts an order inline (same window) using a right-side drawer.
- Captures UTM parameters from the LP URL and forwards them with the order.

## Route
- Path: `/lp/[slug]`
- Example: `/lp/air-tag`
- Server Component page: `src/app/lp/[slug]/page.tsx`

## Data Sources (Supabase)
- Products: `products`
- Variants (pricing): `variants.price`, `variants.active`
- Inventory (availability): `inventory.stock_on_hand` and `inventory.reserved`, used as `available = on_hand - reserved`
- Color mapping: `variant_option_values` joined with `option_values (value, option_type_id)` where option type is `Color`

Files that implement the above:
- `src/app/lp/[slug]/page.tsx` (server fetch and aggregation)
- `src/components/web/landing/BuyPanel.tsx` (client; shows price/availability per color)
- `src/components/web/landing/OrderDrawer.tsx` (client; order form + POST to API)
- `src/app/api/orders/create/route.ts` (server; inserts `orders` and `order_items`, accepts UTM)

## What’s Implemented
- Server-side LP:
  - Fetches product by slug, active variants with price, inventory for availability, color mapping via `variant_option_values`.
  - Aggregates per-color: lowest price, total availability, and representative `variant_id`.
  - Renders left content (gallery, highlights, bilingual description, specs) and right sticky Buy panel.
- Sticky Buy Panel (`BuyPanel.tsx`):
  - Color selection chips (disabled when out of stock), shows price/availability.
  - Low-stock badge (≤ 5), subtle card shadow, trust row (COD, 24–48h dispatch, Easy Returns).
  - "Start Order" opens the inline drawer.
- Same-window Order Drawer (`OrderDrawer.tsx`):
  - Customer form (name, phone, email, city, province, address, qty).
  - POSTs to `POST /api/orders/create` with payload `{ customer, utm, items: [{ variant_id, qty }] }`.
  - Shows success with returned `order_id` (created in `orders` and `order_items`).
- UTM Capture and SEO/OG:
  - `src/components/web/landing/UTMCapture.tsx` runs on mount to persist `utm_*` from URL.
  - `src/lib/utm.ts` provides `setUTMFromURLOnce()` and `getUTM()`.
  - `generateMetadata()` in the LP page sets title/description/OG/Twitter tags.
- Bilingual description content (EN + Urdu) included under Highlights.

## Key File References
- LP page: `src/app/lp/[slug]/page.tsx`
- Buy panel: `src/components/web/landing/BuyPanel.tsx`
- Order drawer: `src/components/web/landing/OrderDrawer.tsx`
- UTM helpers: `src/lib/utm.ts`, `src/components/web/landing/UTMCapture.tsx`
- Orders API: `src/app/api/orders/create/route.ts`

## UX Overview
- Two-column grid with sticky right panel (`position: sticky; top: 1.5rem` at `lg` breakpoint).
- Start Order opens right-side overlay drawer without navigating.
- Price and stock reflect real data from Supabase (same logic as product page).

## Open Items / Next Steps (Backlog)
1. Gallery
   - Replace static image grid with `ImageCarousel` for the hero image and clickable thumbnails.
   - Lazy-load thumbnails; keep hero priority for LCP.
2. Drawer
   - Add inline validation and helper texts.
   - Add delivery estimate note.
   - Preserve partial form state on accidental close.
3. Content & Trust
   - Add FAQ and Guarantee sections.
   - Add promo/strike-through price (optional) and badges.
4. Performance & Caching
   - Add revalidate strategy (ISR) for LP data.
   - Ensure all images are optimized and sized.
5. Analytics
   - Fire Meta Pixel events (LP view, Start Order, Order success).
   - Consider Conversion API postback after order creation.
6. Admin Content (Optional)
   - Introduce `landing_pages` table (hero, highlights, benefits, testimonials, faqs, seo fields) to make LP editable.

## How to Test Locally
- Visit `/lp/air-tag`.
- Use URL with UTM params, e.g., `/lp/air-tag?utm_source=meta&utm_medium=cpc&utm_campaign=airtag-lp`.
- Switch colors to see price/availability; try an out-of-stock color if available.
- Click Start Order, fill form, submit; confirm `order_id` is returned and records appear in Supabase.

## Notes
- No Git push is performed automatically. Ask to push when ready.
