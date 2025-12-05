# Afal Store Blueprint / Reference

This document summarizes the core architecture and patterns used in the Afal Store project so they can be reused as a blueprint for future projects.

The goal is that new products and landing pages can be launched with **no new code**, only admin configuration in the browser.

---

## 1. High-Level Architecture

- **Framework**: Next.js (App Router) + TypeScript
- **Hosting**: Vercel
- **Database & Auth**: Supabase (Postgres + Supabase client)
- **Static Assets / Uploads**: Supabase Storage (e.g. `product-media` bucket)
- **DNS / Edge**: Cloudflare pointing to Vercel

Two major surfaces:

1. **Viewer Side (Public Site)**
   - Main domain: `afalstore.com`
   - Pages:
     - `/` – Homepage with hero and products grid.
     - `/products` – Listing of all active products.
     - `/lp/[slug]` – Per-product Landing Pages (LPs) for performance and ad traffic.
   - Purpose: Show products, drive clicks to LPs, and optimize conversions and tracking.

2. **Admin Side**
   - Internal admin routes under `/admin`.
   - Key pages:
     - `/admin/products` – List + quick view of products.
     - `/admin/products/[id]` – Edit product + configure LP.
     - `/admin/orders` and `/admin/orders/[id]` – Order management.
   - Purpose: Let non-technical users configure products & LPs without touching code.

---

## 2. Product & LP Data Model

Core tables (Supabase/Postgres):

- **`products`**
  - `id`, `name`, `slug`, `active`
  - Content: `description_en`, `description_ur`, `logo_url`, etc.
  - Channel flags: `daraz_enabled`, `chat_enabled`, etc.
  - Social & contact:
    - `fb_page_url`, `instagram_url`, `whatsapp_url`, `contact_email`, `contact_phone`
    - Boolean flags `*_enabled` to control visibility on LP.

- **`variants`**
  - `id`, `product_id`
  - Attributes: color/size, `price`, `active`.
  - Used to compute `fromPrice` (lowest active variant price per product).

- **`product_media`**
  - `product_id`
  - `url`, `type` (`image` or `video`), `sort`.
  - LP galleries and product cards use **first `image` by `sort`** as thumbnail.

- **`orders` / `order_lines`**
  - Order metadata, line items, `shipping_amount`, totals.

### Key principle

LP (Landing Page) is the dedicated product page at `/lp/[slug]`.

> LPs and main-site product views must always be driven entirely by Supabase data.

Adding a product row + configuring it in admin is enough to:

- Create a live LP at `/lp/[slug]`.
- Expose that product on homepage hero, homepage products grid, and `/products`.

Example: Add a new product called **"Android Tag 2"** in admin and set it active.

- Its LP appears at `/lp/android-tag-2`.
- It shows up automatically on the homepage hero slider, homepage products grid, and `/products` listing.

---

## 3. Landing Pages (LPs)

- Route: `/lp/[slug]`.
- Server component fetches product + variants + media + other config from Supabase.
- Features:
  - Bilingual descriptions.
  - Media gallery (images + videos from `product_media`).
  - Buy panel bound to variants (prices, availability, CTA label/size).
  - Social/contact icons rendered via `SocialLinks` component, controlled by `*_enabled` flags.
  - Meta Pixel events centralized here (for Meta ads and optimization).

**Goal**: For every new product, only admin configuration is needed to create a ready-to-run LP, no new React components.

---

## 4. Homepage & Products Listing Integration

### Homepage (`/`)

- Entry: `src/app/page.tsx` → `HomeServerContainer` → `HomePresenter`.

**Data fetching (`HomeServerContainer`)**

- Uses Supabase server client.
- Loads:
  - Primary/featured product (latest active) for hero fallback.
  - Full list of **active products** for hero slider + bottom grid.
  - For each product:
    - `fromPrice`: lowest active variant price.
    - `image`: first `product_media` row where `type = 'image'`, ordered by `sort`.

**Presentation (`HomePresenter`)**

- **Hero section**:
  - Acts as a **product slider** over all active products.
  - Arrows (left/right) to switch `activeProduct`.
  - Shows `activeProduct.name`, hero image, and `From PKR {fromPrice}`.
  - CTA button: **"View product"** → `/lp/{activeProduct.slug}`.

- **Products grid (bottom)**:
  - Loops over the same `products` array.
  - For each card:
    - Image: first `image` media, or textual placeholder **"Image coming soon"**.
    - Price: `From PKR {fromPrice}` or "Price coming soon" if no variants.
    - Link: `/lp/{slug}`.
  - "View all" link → `/products`.

- **Header nav**:
  - `Products` → `/products`.
  - `Track Order` → placeholder `/track-order` (can be implemented later).

### `/products` listing page

- Route: `src/app/products/page.tsx`.
- Server component that:
  - Fetches all active products from Supabase.
  - Derives `fromPrice` and first `image` in the same way as the homepage.
- Renders a 3-column grid of product cards with the same design as the homepage grid.

**Result**: Any active product automatically appears:

- In hero slider.
- In homepage grid.
- On `/products` listing.

All cards and CTAs route to the LP at `/lp/[slug]`.

---

## 5. Admin Patterns

- Admin UI mirrors database shape closely.
- Each editable section (Basics, Media, Variants, Social & Contact, Checkout Extras, etc.):
  - Reads values from Supabase once.
  - Tracks local React state and a copy of the initial state.
  - Has a dirty-check system to know if there are unsaved changes.
  - Saves back to Supabase via update queries.

- Social & Contact section pattern:
  - Inputs for URLs / emails / phones.
  - Checkboxes `Show on LP` to control `*_enabled` flags.
  - LP only renders entries where flag is true **and** value is non-empty.

---

## 6. Tracking & Meta Pixel Philosophy

- Ad traffic usually lands directly on `/lp/[slug]` for a specific product.
- All important conversion events (view content, add to cart, purchase, etc.) are fired from LP.
- Main site (`/`, `/products`) primarily acts as:
  - Brand surface.
  - Discovery/SEO.
  - Navigation hub into LPs.

For future projects, keep this separation:

- **Landing Pages**: high-conversion, pixel-optimized, product-specific.
- **Main Site**: catalog, navigation, brand, and internal linking into LPs.

---

## 7. Reuse Checklist for New Projects

When starting a new project based on this blueprint:

1. **Decide on core entities** (e.g. `products`, `variants`, `media`, `orders`).
2. **Design Supabase schema** first; keep viewer and admin driven by these tables.
3. **Admin**: build edit pages that fully configure LP content and behavior.
4. **LPs**: per-entity dynamic routes (`/lp/[slug]`) powered entirely by Supabase.
5. **Main site**: homepage hero + grids that list active entities and link into LPs.
6. **Media strategy**: use a `media` table with types and `sort` to control galleries and thumbnails.
7. **Tracking**: centralize ad pixel/conversion logic on LPs, link from main site into LPs.

This way, adding a new product (or similar entity) is always a **no-code** operation for the admin.

---

## 8. Future: Homepage Themes & Platform Vision

- **Homepage themes**
  - Provide 3–4 predefined homepage layouts (different hero styles, grids, colors).
  - Store the active theme in a `home_config` / `site_settings` table (e.g. `active_theme = 'themeA'`).
  - `HomeServerContainer` reads this value and passes it to `HomePresenter`, which switches layout based on the theme.

- **Admin dashboard for homepage**
  - New admin route (e.g. `/admin/home` or `/admin/dashboard`).
  - Lets the admin:
    - Choose the active homepage theme.
    - Select which products should appear on the homepage and `/products`.
    - Reorder products (up/down or drag-and-drop) to control hero order and grid order.
  - Data model options:
    - A `home_config` record with an ordered array of product IDs, or
    - A `homepage_products` table with `product_id` and `position`.

- **Long-term platform vision**
  - Afal Store is intended to become a **product for the Pakistani market**, similar in spirit to Shopify.
  - Other merchants should be able to:
    - Configure products, LPs, and themes through an admin UI.
    - Get a ready-made storefront + LP system with strong Meta pixel integration.
  - The patterns in this document (schema-first design, LP-driven conversions, dynamic main site, admin-driven configuration) are the foundation for turning Afal Store into a multi-tenant SaaS platform.
