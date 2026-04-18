/**
 * Meta Conversions API (CAPI) utilities
 * 
 * Sends server-side events to Meta for better attribution and optimization.
 * Used for Purchase (at order creation) and Delivered (when order is delivered).
 */

import crypto from 'crypto';

// SHA-256 hash helper (Meta requires lowercase, trimmed, hashed values)
export function sha256(s?: string | null): string | undefined {
  if (!s) return undefined;
  try {
    return crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');
  } catch {
    return undefined;
  }
}

// Normalize phone: remove all non-digits (e.g. "+92 300 1234567" → "923001234567")
export function normalizePhone(p?: string | null): string | undefined {
  return p ? p.replace(/\D/g, '') : undefined;
}

export type MetaCapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: 'website';
  user_data: {
    fbp?: string;
    fbc?: string;
    em?: string;  // hashed email
    ph?: string;  // hashed phone
    client_user_agent?: string;
    client_ip_address?: string;
  };
  custom_data: {
    currency: string;
    value: number;
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
    content_type?: string;
  };
};

export type SendMetaEventParams = {
  pixelId: string;
  accessToken: string;
  event: MetaCapiEvent;
  testEventCode?: string;
};

/**
 * Send a single event to Meta Conversions API
 */
export async function sendMetaEvent({ pixelId, accessToken, event, testEventCode }: SendMetaEventParams): Promise<{
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}> {
  try {
    const payload: any = {
      data: [event],
    };
    
    // Only include test_event_code if provided (for testing)
    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const txt = await res.text();
    
    if (!res.ok) {
      console.error('[metaCapi] Error', res.status, txt);
      return { ok: false, status: res.status, body: txt, error: `HTTP ${res.status}` };
    }
    
    console.log('[metaCapi] Sent', { event_name: event.event_name, event_id: event.event_id, status: res.status });
    return { ok: true, status: res.status, body: txt };
  } catch (e: any) {
    console.error('[metaCapi] Exception', e);
    return { ok: false, error: e?.message || 'Unknown error' };
  }
}

/**
 * Build a Delivered event payload for an order
 */
export function buildDeliveredEvent(order: {
  id: string;
  total: number;
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
}): MetaCapiEvent {
  return {
    event_name: 'Delivered',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `${order.id}:delivered`,  // Avoid collision with Purchase event_id
    action_source: 'website',
    user_data: {
      fbp: order.fbp || undefined,
      fbc: order.fbc || undefined,
      em: sha256(order.email),
      ph: sha256(normalizePhone(order.phone)),
    },
    custom_data: {
      currency: 'PKR',
      value: Number(order.total) || 0,
      contents: order.contents,
      content_type: 'product',
    },
  };
}
