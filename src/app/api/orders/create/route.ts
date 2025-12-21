import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseService';
import crypto from 'crypto';
import { getMetaContentId } from '@/lib/metaContentId';

/*
Expected payload (JSON):
{
  "customer": {
    "name": string,
    "email"?: string,
    "phone": string,
    "address": string,
    "city": string,
    "province_code"?: string
  },
  "utm"?: {
    "source"?: string,
    "medium"?: string,
    "campaign"?: string
  },
  "items": [
    { "variant_id": string, "qty": number }
  ]
}
*/

export async function POST(req: Request) {
  try {
    // Debug: confirm env visibility at runtime (safe: does not print secret values)
    try {
      console.log('[orders/create] env check', {
        HAS_RESEND_KEY: !!process.env.RESEND_API_KEY,
        RESEND_FROM: process.env.RESEND_FROM,
        OWNER_EMAIL: process.env.OWNER_EMAIL,
      });
    } catch {}
    // Use privileged client (service role) on the server to bypass RLS during order creation
    // Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
    const supabase = getSupabaseServiceClient();
    const body = await req.json();

    // Basic validation
    const items = (body?.items ?? []) as Array<{ variant_id: string; qty: number }>;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }
    const customer = body?.customer || {};
    if (!customer.name || !customer.phone || !customer.address || !customer.city) {
      return NextResponse.json({ error: 'Missing required customer fields' }, { status: 400 });
    }
    // Delegate atomic creation + reservation to Postgres function `place_order`
    const shippingAmount = Number((body?.shipping?.amount as any) || 0);
    const promo = body?.promo || null;
    const discountTotal = Number(promo?.discount || 0);
    const promoName = promo?.name ? String(promo.name) : null;
    const { data, error } = await supabase.rpc('place_order_v2', {
      p_customer: customer,
      p_items: items,
      p_utm: body?.utm ?? {},
      p_shipping_amount: shippingAmount,
      p_discount_total: discountTotal,
      p_promo_name: promoName,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const orderId = data as string;

    // Upsert into email_list for future campaigns (non-blocking)
    try {
      const email = (customer.email || '').trim();
      if (email) {
        await getSupabaseServiceClient()
          .from('email_list')
          .upsert(
            {
              email: email.toLowerCase(),
              name: customer.name || null,
              phone: customer.phone || null,
              city: customer.city || null,
              province_code: customer.province_code || null,
              last_order_at: new Date().toISOString(),
              source: 'order',
            },
            { onConflict: 'email' },
          );
      }
    } catch (e) {
      console.error('[orders/create] email_list upsert failed', e);
    }

    // Try to send an email notification (non-blocking)
    try {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const FROM = process.env.RESEND_FROM || 'Afal Store <onboarding@resend.dev>';
      const OWNER = process.env.OWNER_EMAIL || 'afalhelp@gmail.com';

      if (!RESEND_API_KEY) {
        console.warn('[orders/create] RESEND_API_KEY missing; skipping email send');
      } else {
        // Pull line details for a proper summary
        const { data: lines } = await getSupabaseServiceClient()
          .from('order_lines')
          .select('variant_id, qty, unit_price, line_total, variants!inner(sku)')
          .eq('order_id', orderId);

        const lineRows = (lines as any[]) || [];
        const subtotal = lineRows.reduce((s, r) => s + Number(r.line_total || 0), 0);
        const shipping = Number((body?.shipping?.amount as any) || 0);
        const total = subtotal + shipping;

        const itemsHtml = lineRows.map(r => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;">${r?.variants?.sku || r.variant_id}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-family:Arial,Helvetica,sans-serif;">${Number(r.qty)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-family:Arial,Helvetica,sans-serif;">PKR ${Number(r.unit_price).toLocaleString()}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-family:Arial,Helvetica,sans-serif;">PKR ${Number(r.line_total).toLocaleString()}</td>
          </tr>
        `).join('');

        const htmlBase = (greeting: string) => `
          <div style="max-width:640px;margin:0 auto;padding:16px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px">
            <h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;color:#111827;">${greeting}</h2>
            <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;color:#374151;">Order ID: <strong>#${orderId}</strong></p>
            <div style="margin:12px 0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#374151;">${customer.name}<br/>
              ${customer.address}, ${customer.city}${customer.province_code ? ' ('+customer.province_code+')' : ''}<br/>
              ${customer.phone}${customer.email ? ' · '+customer.email : ''}</p>
            </div>
            <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:8px">
              <thead>
                <tr style="background:#f3f4f6">
                  <th style="padding:8px;text-align:left;font-family:Arial,Helvetica,sans-serif;color:#374151;">SKU</th>
                  <th style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;color:#374151;">Qty</th>
                  <th style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;color:#374151;">Unit</th>
                  <th style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;color:#374151;">Line</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3" style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #eee;">Items subtotal</td>
                  <td style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #eee;">PKR ${subtotal.toLocaleString()}</td>
                </tr>
                <tr>
                  <td colspan="3" style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;">Shipping</td>
                  <td style="padding:8px;text-align:right;font-family:Arial,Helvetica,sans-serif;">PKR ${Number(shipping).toLocaleString()}</td>
                </tr>
                <tr>
                  <td colspan="3" style="padding:8px;text-align:right;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">Total</td>
                  <td style="padding:8px;text-align:right;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">PKR ${total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            <p style="margin-top:16px;font-family:Arial,Helvetica,sans-serif;color:#6b7280;font-size:14px;">If you have any questions, simply reply to this email.</p>
          </div>`;

        const sendEmailResend = async (payload: { to: string[]; subject: string; text: string; html: string }) => {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM,
              to: payload.to,
              subject: payload.subject,
              text: payload.text,
              html: payload.html,
              reply_to: customer.email ? [String(customer.email)] : undefined,
            }),
          });
          const text = await res.text();
          if (!res.ok) {
            console.error('[orders/create] Resend error', res.status, text);
            return { ok: false, status: res.status, body: text } as const;
          }
          console.log('[orders/create] Resend accepted', text);
          return { ok: true } as const;
        };

        // Send admin email
        await sendEmailResend({
          to: [OWNER],
          subject: `New order placed: ${orderId}`,
          text: `New order ${orderId} by ${customer.name}, phone ${customer.phone}. Total: PKR ${total}.`,
          html: htmlBase('New order received'),
        });

        // Customer confirmation
        if (customer.email) {
          await sendEmailResend({
            to: [String(customer.email)],
            subject: `Thank you for your order (${orderId})`,
            text: `Thank you for your order. Your order ID is ${orderId}. Total: PKR ${total}.`,
            html: htmlBase('Thank you for your order'),
          });
        }
      }
    } catch (e) {
      // Swallow email errors; do not block order creation
      console.error('Email notification failed', e);
    }

    // Conversions API (Meta) — Purchase event (server-to-server)
    try {
      const GLOBAL_PIXEL_ID = process.env.FB_PIXEL_ID;
      const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
      if (!ACCESS_TOKEN) {
        console.warn('[orders/create] FB CAPI disabled (missing FB_ACCESS_TOKEN)');
      } else {
        // Build value/contents from order_lines and resolve per-product pixel from variants -> products -> product_pixel
        const { data: lines2 } = await getSupabaseServiceClient()
          .from('order_lines')
          .select('variant_id, qty, unit_price, line_total, variants!inner(sku, product_id)')
          .eq('order_id', orderId);
        const lineRows2 = (lines2 as any[]) || [];
        const value = lineRows2.reduce((s, r) => s + Number(r.line_total || 0), 0) + Number((body?.shipping?.amount as any) || 0); // include shipping

        // Resolve pixel and content_id_source: if exactly one enabled per-product pixel among products in the order, use it; else fallback to global and default sku
        const productIdsSet = new Set<string>();
        for (const r of lineRows2) {
          const pid = (r as any)?.variants?.product_id as string | undefined;
          if (pid) productIdsSet.add(pid);
        }
        let resolvedPixelId: string | undefined = undefined;
        let resolvedContentIdSource: 'sku' | 'variant_id' = 'sku';
        let resolveReason = 'no_products';
        if (productIdsSet.size > 0) {
          const productIds = Array.from(productIdsSet);
          const { data: pixelRows } = await getSupabaseServiceClient()
            .from('product_pixel')
            .select('product_id, enabled, pixel_id, content_id_source')
            .in('product_id', productIds);
          const enabledRows = (pixelRows || []).filter((p: any) => !!p?.enabled && !!(p?.pixel_id || '').trim());
          const enabledPixels = enabledRows.map((p: any) => String(p.pixel_id).trim());
          const distinct = Array.from(new Set(enabledPixels));
          if (distinct.length === 1) {
            resolvedPixelId = distinct[0];
            const sources = Array.from(new Set(enabledRows.map((p: any) => (p.content_id_source === 'variant_id' ? 'variant_id' : 'sku'))));
            if (sources.length === 1) {
              resolvedContentIdSource = sources[0] as 'sku' | 'variant_id';
            }
            resolveReason = 'single_per_product_pixel';
          } else if (distinct.length > 1) {
            resolveReason = 'multiple_per_product_pixels_fallback_global';
          } else {
            resolveReason = 'no_per_product_pixels_fallback_global';
          }
        }
        if (!resolvedPixelId) {
          resolvedPixelId = (GLOBAL_PIXEL_ID || '').trim() || undefined;
          resolvedContentIdSource = 'sku';
        }

        console.log('[orders/create] FB CAPI pixel resolve', {
          orderId,
          pixel: resolvedPixelId || 'undefined',
          reason: resolveReason,
          env: process.env.NODE_ENV,
        });

        if (!resolvedPixelId) {
          console.warn('[orders/create] FB CAPI skipped (no per-product pixel and no global fallback)');
        } else {
          // User data: fbp/fbc from payload, IP/UA from headers, hash email/phone
          const fbp = body?.fbMeta?.fbp || null;
          const fbc = body?.fbMeta?.fbc || null;
          const ua = req.headers.get('user-agent') || undefined;
          const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || undefined;

          const sha256 = (s?: string | null) => {
            if (!s) return undefined;
            try {
              return crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');
            } catch { return undefined; }
          };
          const em = sha256(body?.customer?.email || null);
          // Normalize PK phone like +92XXXXXXXXXX before hashing
          const normPhone = (p?: string | null) => (p ? p.replace(/\D/g, '') : undefined);
          const ph = sha256(normPhone(body?.customer?.phone || null));

          const contents = lineRows2.map((r) => ({
            id: getMetaContentId({ id: String((r as any).variant_id), sku: (r as any)?.variants?.sku || null }, resolvedContentIdSource),
            quantity: Number((r as any).qty),
            item_price: Number((r as any).unit_price),
          }));

          const payload = {
            data: [
              {
                event_name: 'Purchase',
                event_time: Math.floor(Date.now() / 1000),
                event_id: String(orderId), // dedupe with browser Purchase if sent with same id
                action_source: 'website',
                event_source_url: undefined,
                user_data: {
                  client_user_agent: ua,
                  client_ip_address: ip,
                  fbp: fbp || undefined,
                  fbc: fbc || undefined,
                  em,
                  ph,
                },
                custom_data: {
                  currency: 'PKR',
                  value: Number(isFinite(value as any) ? value : 0),
                  contents,
                  content_type: 'product',
                },
              },
            ],
            // Only include test_event_code outside production
            test_event_code: process.env.NODE_ENV !== 'production' ? (process.env.FB_TEST_EVENT_CODE || undefined) : undefined,
          } as any;
          const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(resolvedPixelId)}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const txt = await res.text();
          if (!res.ok) {
            console.error('[orders/create] FB CAPI error', res.status, txt);
          } else {
            console.log('[orders/create] FB CAPI sent', { status: res.status, body: txt?.slice?.(0, 500) });
          }
        }
      }
    } catch (e) {
      console.error('[orders/create] FB CAPI exception', e);
    }
    // Always respond with success JSON when order is created
    return NextResponse.json({ ok: true, order_id: orderId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
