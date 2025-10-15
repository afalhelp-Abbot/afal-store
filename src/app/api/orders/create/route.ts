import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseService';

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
    const { data, error } = await supabase.rpc('place_order', {
      p_customer: customer,
      p_items: items,
      p_utm: body?.utm ?? {},
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const orderId = data as string;
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
    // Always respond with success JSON when order is created
    return NextResponse.json({ ok: true, order_id: orderId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}
