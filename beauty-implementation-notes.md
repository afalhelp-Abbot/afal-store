# Beauty Platform – Implementation Notes (Tech)

## 1. Codebases and Locations

- **AFAL Store (live, hair project)**
  - Path: `c:\Users\thatc\Desktop\Faisal\Hair project\afal-store`
  - Tech: Next.js + Supabase
  - Status: Production-quality with promotions.

- **Beauty Store (new project, reusing AFAL engine)**
  - Path: `c:\Users\thatc\Desktop\Faisal\Projects with Sarah\beauty-store`
  - Code: `src/` copied from latest **afal-store** on 2025-12-05.
  - Git: separate repo / can be initialized independently.
  - Purpose: Beauty / skin / hair products (beautician network, new Supabase).

## 2. Supabase Projects (IMPORTANT)

- **AFAL Store Supabase**
  - Used only by `afal-store` codebase.
  - Contains live AFAL products, orders, reviews, etc.

- **Beauty Platform Supabase** – separate account / project
  - Name: `aestheticsupplypk` (from notes).
  - Used only by **beauty-store**.
  - Needs schema migrated from AFAL (products, variants, inventory, orders, profiles, shipping, etc.).

> The two projects must stay separate: **do not point beauty-store at AFAL Supabase**.

## 3. What Is Already Done (2025-12-05)

- `beauty-store/src` mirrors latest AFAL app code (admin + LP + checkout + promotions).
- High-level business and reuse plans written in:
  - `Afal-reuse.md`
  - `beauty-business-notes.md`

## 4. Next Steps When Opening `beauty-store`

1. **Create / update `.env.local` for beauty-store**
   - File: `c:\Users\thatc\Desktop\Faisal\Projects with Sarah\beauty-store\.env.local`
   - Set values from **aestheticsupplypk** Supabase project:
     - `NEXT_PUBLIC_SUPABASE_URL=<beauty Supabase URL>`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<beauty anon key>`
     - `SUPABASE_SERVICE_ROLE_KEY=<beauty service role key>` (server only, never commit).

2. **Install and run app (beauty-store)**
   - Open terminal in `beauty-store` folder.
   - Run:
     - `npm install` (first time only)
     - `npm run dev`
   - Visit:
     - `/admin` – should connect to empty beauty Supabase.
     - `/lp/test-slug` – will 404 until we add products.

3. **Migrate DB schema into `aestheticsupplypk`**
   - From AFAL Supabase, export or recreate tables:
     - `products`, `product_media`, `product_specs`, `product_sections`.
     - `option_types`, `option_values`, `variants`, `inventory`, `inventory_changes`.
     - `orders`, `order_items` / `order_lines`, shipping-related tables.
     - `profiles` (with `role` column for permissions).
   - Apply same RLS policies, then adapt roles:
     - `admin_full` (you + HK partner).
     - `admin_logistics` (Karachi partner).

4. **Branding & Content for Beauty**
   - Replace AFAL logos, colors, and names with beauty brand.
   - Add first beauty product via `/admin/products` in beauty-store.
   - Verify LP `/lp/[slug]` and full checkout flow using the new Supabase project.

## 5. When You Resume Later

- Open **this file** first to remember:
  - Which folders are AFAL vs Beauty.
  - That beauty-store uses **a different Supabase project/account**.
  - The next concrete tasks: env setup → run app → migrate schema → branding.
