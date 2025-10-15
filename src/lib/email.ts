export type OrderItemBrief = { sku?: string; variant_id: string; qty: number; price: number };

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'afalhelp@gmail.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'orders@afalstore.local';

async function sendViaResend(to: string | string[], subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set. Skipping email send.');
    return { ok: false, skipped: true } as const;
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    console.error('Resend error:', txt);
    return { ok: false } as const;
  }
  return { ok: true } as const;
}

export async function sendEmail(to: string | string[], subject: string, html: string) {
  return sendViaResend(to, subject, html);
}

export function renderOrderEmail(opts: {
  orderId: string;
  customer: { name: string; email?: string | null; phone: string; address: string; city: string; province_code?: string | null };
  items: OrderItemBrief[];
  total: number;
}) {
  const { orderId, customer, items, total } = opts;
  const rows = items
    .map((it) => `<tr><td style=\"padding:4px 8px;border:1px solid #ddd\">${it.sku || it.variant_id}</td><td style=\"padding:4px 8px;border:1px solid #ddd\">${it.qty}</td><td style=\"padding:4px 8px;border:1px solid #ddd\">${Number(it.price).toLocaleString()} PKR</td></tr>`)  
    .join('');
  const html = `
    <div style="font-family:system-ui, Arial, sans-serif">
      <h2>Order Confirmation #${orderId}</h2>
      <p>Thanks for your order.</p>
      <h3>Customer</h3>
      <p>
        ${customer.name}<br/>
        ${customer.email || ''}<br/>
        ${customer.phone}<br/>
        ${customer.address}<br/>
        ${customer.city}${customer.province_code ? ` (${customer.province_code})` : ''}
      </p>
      <h3>Items</h3>
      <table style="border-collapse:collapse">
        <thead>
          <tr><th style="padding:4px 8px;border:1px solid #ddd">SKU</th><th style="padding:4px 8px;border:1px solid #ddd">Qty</th><th style="padding:4px 8px;border:1px solid #ddd">Unit Price</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="2" style="padding:4px 8px;border:1px solid #ddd;text-align:right"><strong>Total</strong></td><td style="padding:4px 8px;border:1px solid #ddd"><strong>${Number(total).toLocaleString()} PKR</strong></td></tr>
        </tfoot>
      </table>
      <p style="margin-top:12px;color:#555">We will contact you shortly to confirm your order and shipping.</p>
    </div>
  `;
  return html;
}

export async function notifyOrderPlaced(params: {
  orderId: string;
  customer: { name: string; email?: string | null; phone: string; address: string; city: string; province_code?: string | null };
  items: OrderItemBrief[];
  total: number;
}) {
  const subject = `New Order #${params.orderId}`;
  const html = renderOrderEmail(params);
  const recipients: string[] = [OWNER_EMAIL];
  if (params.customer.email) recipients.push(params.customer.email);
  return sendEmail(recipients, subject, html);
}
