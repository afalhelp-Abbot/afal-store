# Reviews implementation notes (AFAL Store)

Date: 2025-11-06

## Goal
Collect product reviews only from verified purchasers (by phone), allow optional images, and render reviews on the LP. Keep the UX conversion-friendly and professional.

## Data model (Supabase)
- Table: `public.product_reviews`
  - id (uuid, pk)
  - product_id (uuid, fk -> products)
  - variant_id (uuid, nullable, fk -> variants)
  - rating int (1–5)
  - title text (optional)
  - body text (20–800 chars)
  - author_name text (optional)
  - phone_hash text (sha256 of normalized phone)
  - email_hash text (optional)
  - order_id uuid (nullable, fk -> orders)
  - status text ('pending'|'approved'|'rejected'), default 'pending'
  - created_at timestamptz default now()

- Table: `public.product_review_media`
  - id (uuid, pk)
  - review_id uuid (fk -> product_reviews)
  - url text
  - created_at timestamptz default now()

- RLS
  - Enabled on both tables
  - Policies: allow SELECT of approved reviews/media to anon/auth; no public writes. Inserts/updates done through server (service role).

## Storage
- Bucket: `reviews` (public). Server uploads image files and returns public URLs.

## Server endpoints
- `POST /api/reviews/submit`
  - Input: { product_id, variant_id?, rating, title?, body, author_name?, phone, images?: string[] }
  - Phone UX rule: user enters last 10 digits only; API receives `+92` + digits.
  - Verification: finds a shipped order for the SAME product and matching phone:
    - checks `order_lines -> orders (shipped) -> variants(product_id)` (web orders)
    - if not found, checks `order_items -> orders (shipped) -> variants(product_id)` (admin orders)
    - compares digits-only phone and also accepts last-10-digits match
  - On success: inserts review as `pending`, attaches up to 2 media URLs.

- `POST /api/reviews/upload`
  - Multipart form; accepts up to 2 files, 2MB each; jpg/jpeg/png/webp.
  - Stores in `reviews/` and returns public URLs.

- `GET /api/reviews?product_id=...&limit=...&offset=...`
  - Returns { ok, summary: { count, avg }, reviews: [...] } for approved reviews only.

## LP UI
- Files:
  - `src/components/web/reviews/ReviewsSection.tsx` — list + modal form (Write a review)
    - Modal note: "Only verified purchasers can write a review. We will verify your phone against shipped orders."
    - Phone input renders `+92` prefix with a 10-digit field (`3xxxxxxxxx`).
    - Allows up to 2 images.
  - `src/components/web/reviews/ReviewSummary.tsx` — compact stars + count + Read reviews link.
  - `src/app/lp/[slug]/page.tsx` — integrated:
    - Added ReviewSummary under Buy panel (mobile + desktop)
    - Inserted ReviewsSection near the bottom
    - Added mobile sentinel and extra spacer above reviews to avoid overlap with floating Start Order panel; added mobile-only footer text "afalstore"

## Behavior / UX
- Reviews displayed to everyone (approved only).
- Form hidden by default; opened via "Write a review" button.
- Verified purchaser gate: phone must match a shipped order for the same product.
- Name optional; when missing, display "Verified buyer".

## What’s pending / future
- Admin moderation page to approve/reject reviews.
- Optional OTP flow or tokenized invite to further tighten verification.

## Quick test plan
1) Ensure tables + policies exist (see SQL used earlier).
2) Place a test order, mark it as shipped (same product as LP being tested).
3) On LP:
   - Click Write a review → enter last 10 digits after +92 (e.g., 3xxxxxxxxx).
   - Submit: expect 200 OK and message: pending moderation.
4) Approve review (after moderation UI is added) → verify it appears and summary updates.

## Modified/new files in this commit series
- `src/app/api/reviews/submit/route.ts` (server verification + insert)
- `src/app/api/reviews/upload/route.ts` (image uploads)
- `src/app/api/reviews/route.ts` (fetch approved + summary)
- `src/components/web/reviews/ReviewsSection.tsx` (list + modal form)
- `src/components/web/reviews/ReviewSummary.tsx` (summary under panel)
- `src/app/lp/[slug]/page.tsx` (integration + mobile spacers)

