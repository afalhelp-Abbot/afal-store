# Meta Pixel Architecture for afalstore.com

## Ownership & Control
- **Domain & DNS:** Owned and managed by you.
- **Master Pixel:** Pixel A (your pixel), owned by your Business Manager.
- **Domain Verification & AEM:** Configured in your Business Manager only, attached to Pixel A.

## Tracking Architecture
- **On the website (Next.js app):**
  - Only **Pixel A** is loaded and used.
  - All browser events (`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Purchase`, `Contact`, `VideoPlay`, etc.) fire to Pixel A.
- **No Pixel B code** is present on the site in the long term.

## Ad Accounts & Usage
- **Your ad account (CAD):**
  - Can still run campaigns on Pixel A if needed.
- **Partner’s ad account (PKR, main scaling account):**
  - Gets **Advertiser** access to Pixel A via Business Manager sharing.
  - All major campaigns optimize for **Pixel A / Purchase** (and other standard events as needed).

## Pixel B (Partner’s Pixel)
- Has its own historical data, but:
  - Is **not** used as the primary optimization pixel going forward.
  - Receives **no new events** from the website once the transition is complete.
  - Can be kept temporarily for **existing Custom Audiences** and reporting until they naturally age out.

## Rationale
- Meta optimizes **per pixel dataset**, not per ad account.
- Consolidating all future events into **one master pixel (Pixel A)**:
  - Maximizes learning density and stability.
  - Avoids fragmented signals between two weaker pixels.
  - Reuses your successful historical campaigns on Pixel A.
- Keeping the pixel and domain under the same owner (you) preserves long‑term control and reduces business risk.

## Optional Future Enhancements
- **Conversions API (CAPI) for Pixel A only:**
  - Add server‑side events with strong `user_data` and shared `event_id` for browser/server dedup.
  - Always send `value` in **PKR** to match store currency.
- **Audience migration from Pixel B:**
  - Before fully sunsetting Pixel B, create and use Custom Audiences (e.g., purchasers, ATC) and Lookalikes from Pixel B as temporary seeds while new Pixel A audiences grow.

## Transition Notes (if needed)
- A short (≤30 days) dual‑firing period of Pixel A + Pixel B is optional, only to soften the shift for existing Pixel B campaigns.
- Long term, the site should **only fire Pixel A**, and all scaling campaigns should optimize on Pixel A.
