\# Beauty Business Platform – Plan



\## 1. Business Overview



\- Import beauty / skin / hair products from China.

\- Sell in Pakistan mainly via:

  - Existing beautician network (HK partner’s 1000+ students).

  - Future direct consumers.



\### Partners and Roles



\- \*\*You (Owner / Coordinator)\*\*

  - Overall management.

  - Coordinate with suppliers in China.

  - Oversee tech and operations.



\- \*\*Hong Kong Partner (Beautician / Product Expert)\*\*

  - Recommends products and verifies quality.

  - Has >1000 beautician students in Pakistan (core first customers).

  - Currently receives advance payments from beauticians into her bank account.



\- \*\*Karachi Partner (Logistics)\*\*

  - Receives order details.

  - Handles local delivery and shipment inside Pakistan.

  - Collects/coordinates cash-on-delivery where needed.



\## 2. Current Manual Workflow



1\. Beautician places order (usually via WhatsApp).

2\. Beautician pays \*\*advance\*\* into HK partner’s bank account.

3\. HK partner confirms payment and writes order details manually (paper / notes).

4\. HK partner forwards order details to Karachi partner on WhatsApp.

5\. Karachi partner ships products and updates HK partner / customer on WhatsApp.

6\. No central system for:

   - Order status.

   - Payment tracking.

   - Inventory / stock.

   - Customer history.



\## 3. New Website – Goals



We will build a website with \*\*two main parts\*\*:



1\. \*\*Customer / Beautician Side\*\*

   - Browse products (beauty / skin / hair).

   - View detailed landing pages for each product.

   - Place orders online (initially with manual payment confirmation; later online payments).



2\. \*\*Admin Side\*\*

   - Based on existing \[afal-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/afal-store:0:0-0:0) admin design.

   - Roles:

     - \*\*Full Admin (You + HK Partner)\*\*

       - Manage products, prices, variants, landing page content.

       - View all orders (manual + online).

       - Update payment status, notes, and reports.

       - Manage users and permissions.

     - \*\*Karachi Partner (Logistics Admin)\*\*

       - Can only:

         - View list of orders assigned to Pakistan.

         - Update shipping info (courier, tracking, status: pending → shipped → delivered).

       - Cannot change products, prices, or sensitive settings.



\## 4. Reusing Existing Project (\[afal-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/afal-store:0:0-0:0))



\- Existing project at

  `C:\\\\Users\\\\thatc\\\\Desktop\\\\Faisal\\\\Projects with Sarah\\\\afal-store`.

\- Built with:

  - Next.js frontend.

  - Supabase for:

    - `products`, `product\\\_media`, `product\\\_specs`, `product\\\_sections`.

    - `option\\\_types`, `option\\\_values`, `variants`, `inventory`.

    - `orders`, `order\\\_items` / `order\\\_lines`, shipping tables, `profiles`.

\- Already has:

  - Admin layout with sidebar (`Dashboard`, `Inventory`, `Orders`, `Reviews`, `Shipping`, `Products`).

  - Product list + “Add product” + “Edit product”.

  - Rich product editor (EN/UR descriptions, variations, specs, images, video).

  - Public landing pages `/lp/\\\[slug]` that show full product page.



\*\*Plan:\*\* reuse this structure for the beauty business by connecting the code to a \*\*new Supabase project\*\* and adjusting branding and roles.



\## 5. New Supabase Project



\- New Supabase project created: \*\*aestheticsupplypk\*\* (name from screenshot).

\- Will replicate the key tables from the old \[afal-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/afal-store:0:0-0:0) project:

  - `products`, `product\\\_media`, `product\\\_specs`, `product\\\_sections`.

  - `option\\\_types`, `option\\\_values`, `variants`, `inventory`, `inventory\\\_changes`.

  - `orders`, `order\\\_items`, `order\\\_lines`, shipping tables, `profiles`.

\- Add role fields / policies so:

  - HK / owner accounts have full admin.

  - Karachi account has restricted permissions (orders + shipping only).



\## 6. Next Implementation Steps (after renaming folder)



1\. \*\*Prepare code copy\*\*

   - Rename `afal-store - Copy` → \[beauty-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/beauty-store:0:0-0:0) (when Windows allows).

   - Work in \[beauty-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/beauty-store:0:0-0:0) as the new beauty platform codebase.



2\. \*\*Connect to new Supabase\*\*

   - Create `.env.local` in \[beauty-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/beauty-store:0:0-0:0).

   - Set:

     - `NEXT\\\_PUBLIC\\\_SUPABASE\\\_URL`

     - `NEXT\\\_PUBLIC\\\_SUPABASE\\\_ANON\\\_KEY`

     - `SUPABASE\\\_SERVICE\\\_ROLE\\\_KEY` (for server-side operations; do not commit).



3\. \*\*Run app\*\*

   - `npm install`

   - `npm run dev`

   - Verify `/admin` and `/lp/\\\[slug]` work with the new database.



4\. \*\*Customize for Beauty Business\*\*

   - Change branding (logos, site name, colors).

   - Implement admin role separation (owner+HK vs Karachi).

   - Add order flow suitable for:

     - Advance bank transfer to HK partner.

     - Local shipping via Karachi partner.

   - Later: add payment gateway for consumers.

\# Beauty Business Platform – Plan



\## 1. Business Overview



\- Import beauty / skin / hair products from China.

\- Sell in Pakistan mainly via:

  - Existing beautician network (HK partner’s 1000+ students).

  - Future direct consumers.



\### Partners and Roles



\- \*\*You (Owner / Coordinator)\*\*

  - Overall management.

  - Coordinate with suppliers in China.

  - Oversee tech and operations.



\- \*\*Hong Kong Partner (Beautician / Product Expert)\*\*

  - Recommends products and verifies quality.

  - Has >1000 beautician students in Pakistan (core first customers).

  - Currently receives advance payments from beauticians into her bank account.



\- \*\*Karachi Partner (Logistics)\*\*

  - Receives order details.

  - Handles local delivery and shipment inside Pakistan.

  - Collects/coordinates cash-on-delivery where needed.



\## 2. Current Manual Workflow



1\. Beautician places order (usually via WhatsApp).

2\. Beautician pays \*\*advance\*\* into HK partner’s bank account.

3\. HK partner confirms payment and writes order details manually (paper / notes).

4\. HK partner forwards order details to Karachi partner on WhatsApp.

5\. Karachi partner ships products and updates HK partner / customer on WhatsApp.

6\. No central system for:

   - Order status.

   - Payment tracking.

   - Inventory / stock.

   - Customer history.



\## 3. New Website – Goals



We will build a website with \*\*two main parts\*\*:



1\. \*\*Customer / Beautician Side\*\*

   - Browse products (beauty / skin / hair).

   - View detailed landing pages for each product.

   - Place orders online (initially with manual payment confirmation; later online payments).



2\. \*\*Admin Side\*\*

   - Based on existing \[afal-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/afal-store:0:0-0:0) admin design.

   - Roles:

     - \*\*Full Admin (You + HK Partner)\*\*

       - Manage products, prices, variants, landing page content.

       - View all orders (manual + online).

       - Update payment status, notes, and reports.

       - Manage users and permissions.

     - \*\*Karachi Partner (Logistics Admin)\*\*

       - Can only:

         - View list of orders assigned to Pakistan.

         - Update shipping info (courier, tracking, status: pending → shipped → delivered).

       - Cannot change products, prices, or sensitive settings.



\## 4. Reusing Existing Project (\[afal-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/afal-store:0:0-0:0))



\- Existing project at

  `C:\\\\Users\\\\thatc\\\\Desktop\\\\Faisal\\\\Projects with Sarah\\\\afal-store`.

\- Built with:

  - Next.js frontend.

  - Supabase for:

    - `products`, `product\\\_media`, `product\\\_specs`, `product\\\_sections`.

    - `option\\\_types`, `option\\\_values`, `variants`, `inventory`.

    - `orders`, `order\\\_items` / `order\\\_lines`, shipping tables, `profiles`.

\- Already has:

  - Admin layout with sidebar (`Dashboard`, `Inventory`, `Orders`, `Reviews`, `Shipping`, `Products`).

  - Product list + “Add product” + “Edit product”.

  - Rich product editor (EN/UR descriptions, variations, specs, images, video).

  - Public landing pages `/lp/\\\[slug]` that show full product page.



\*\*Plan:\*\* reuse this structure for the beauty business by connecting the code to a \*\*new Supabase project\*\* and adjusting branding and roles.



\## 5. New Supabase Project



\- New Supabase project created: \*\*aestheticsupplypk\*\* (name from screenshot).

\- Will replicate the key tables from the old \[afal-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/afal-store:0:0-0:0) project:

  - `products`, `product\\\_media`, `product\\\_specs`, `product\\\_sections`.

  - `option\\\_types`, `option\\\_values`, `variants`, `inventory`, `inventory\\\_changes`.

  - `orders`, `order\\\_items`, `order\\\_lines`, shipping tables, `profiles`.

\- Add role fields / policies so:

  - HK / owner accounts have full admin.

  - Karachi account has restricted permissions (orders + shipping only).



\## 6. Next Implementation Steps (after renaming folder)



1\. \*\*Prepare code copy\*\*

   - Rename `afal-store - Copy` → \[beauty-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/beauty-store:0:0-0:0) (when Windows allows).

   - Work in \[beauty-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/beauty-store:0:0-0:0) as the new beauty platform codebase.



2\. \*\*Connect to new Supabase\*\*

   - Create `.env.local` in \[beauty-store](cci:7://file:///c:/Users/thatc/Desktop/Faisal/Projects%20with%20Sarah/beauty-store:0:0-0:0).

   - Set:

     - `NEXT\\\_PUBLIC\\\_SUPABASE\\\_URL`

     - `NEXT\\\_PUBLIC\\\_SUPABASE\\\_ANON\\\_KEY`

     - `SUPABASE\\\_SERVICE\\\_ROLE\\\_KEY` (for server-side operations; do not commit).



3\. \*\*Run app\*\*

   - `npm install`

   - `npm run dev`

   - Verify `/admin` and `/lp/\\\[slug]` work with the new database.



4\. \*\*Customize for Beauty Business\*\*

   - Change branding (logos, site name, colors).

   - Implement admin role separation (owner+HK vs Karachi).

   - Add order flow suitable for:

     - Advance bank transfer to HK partner.

     - Local shipping via Karachi partner.

   - Later: add payment gateway for consumers.

