# Email Setup, Deliverability, and Maintenance

This document summarizes how order emails are sent, what environment variables are required, how to improve deliverability (DMARC), and what to do later when tightening policies.

## Overview
- **Sending Provider:** Resend
- **Where emails are sent from (code):** `src/app/api/orders/create/route.ts`
  - After creating an order, the API sends two emails (owner and customer) via Resend HTTP API.
  - Logs appear in the terminal running Next.js and in Resend → Logs.
- **From Address:** `RESEND_FROM` (e.g., `Afal Store <orders@afalstore.com>`) must use a domain verified in Resend.

## Environment Variables
Create or update `afal-store/.env.local` and restart the server after edits:
```
RESEND_API_KEY=re_XXXXXXXXXXXXXXXXXXXXXXXX
RESEND_FROM=Afal Store <orders@afalstore.com>
OWNER_EMAIL=afalhelp@gmail.com

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```
Notes:
- No quotes required for `RESEND_API_KEY`.
- Ensure `.env.local` has no `.txt` extension and sits next to `package.json`.

## Developer Checks
- Place a test order from `/checkout`.
- Terminal logs show an env check and either:
  - `Resend accepted ...` or
  - `Resend error <status> <body>` (use the body to fix issues).
- Resend → Logs should list attempts and their status.

## DMARC: Step-by-Step
1. Cloudflare → `afalstore.com` → DNS → **Add record**.
2. Type `TXT`, Name `_dmarc`.
3. Initial content (collect reports; do not affect delivery):
```
v=DMARC1; p=none; rua=mailto:postmaster@afalstore.com; ruf=mailto:postmaster@afalstore.com; fo=1; pct=100
```
4. Save and wait 15–60 minutes.
5. Optional enhancements (later):
   - Subdomain policy: add `sp=quarantine` (affects subdomains).
   - Strict alignment: add `adkim=s; aspf=s`.

## After a Few Days (Tighten Policy)
When DMARC reports look clean and most traffic authenticates:
- Move to quarantine:
```
v=DMARC1; p=quarantine; rua=mailto:postmaster@afalstore.com; ruf=mailto:postmaster@afalstore.com; fo=1; pct=100
```
- Later, move to reject:
```
v=DMARC1; p=reject; rua=mailto:postmaster@afalstore.com; ruf=mailto:postmaster@afalstore.com; fo=1; pct=100
```

## Deliverability Tips
- Verify domain in Resend (Domains → should be Verified).
- Prefer a dedicated sending subdomain (e.g., `mail.afalstore.com`) and set `RESEND_FROM=orders@mail.afalstore.com` once verified.
- Remove unused SPF/DKIM records from other providers (e.g., SES) to avoid mixed signals.
- Turn OFF open/click tracking for transactional emails initially in Resend settings.
- Keep From name consistent: `Afal Store`.
- Include a text body (already done) and keep HTML simple.
- Ask early recipients to mark “Not spam”.

## Troubleshooting
- If the log shows `RESEND_API_KEY missing`: `.env.local` not loaded (restart server, ensure correct filename/location, no BOM/encoding issues).
- If Resend returns an error status:
  - `403`/`401`: API key invalid or disabled.
  - `422`: sender/recipient/syntax invalid; verify From domain, recipient suppression.
  - Check Resend → Logs → open the entry for details.
- If customer emails go to Spam:
  - Add/confirm DMARC (above), wait for reputation to improve.
  - Move to a sending subdomain and warm up gradually.

## Optional: Reply-To
- Owner email: reply-to is set to the customer (for quick responses).
- Customer email: reply-to can be set to your support/Orders inbox. Add to `.env.local` if desired:
```
REPLY_TO=orders@afalstore.com
```
(Then update the API route to use it.)

## Quick Checklist (Runbook)
- [ ] Domain verified in Resend.
- [ ] `.env.local` contains `RESEND_API_KEY`, `RESEND_FROM`, `OWNER_EMAIL`.
- [ ] DMARC `_dmarc` TXT present with `p=none` (initial) → escalate to `quarantine`/`reject` later.
- [ ] Unused email provider records removed.
- [ ] Test order placed; logs show `Resend accepted`.
- [ ] Resend → Logs confirm Delivered/Accepted.
