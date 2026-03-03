// Session tracking for advertising attribution
// Captures UTMs, device info, and creates/reuses sessions

import { supabaseBrowser } from './supabaseBrowser';

const VISITOR_ID_KEY = 'afal_visitor_id';
const SESSION_ID_KEY = 'afal_session_id';
const SESSION_PRODUCT_KEY = 'afal_session_product';
const SESSION_CREATED_KEY = 'afal_session_created';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const SESSION_REUSE_MINUTES = 30;

export type SessionData = {
  id: string;
  visitor_id: string;
  entry_product_id: string | null;
  entry_lp_slug: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
  referrer: string | null;
  device_category: string | null;
};

// Get or create visitor ID (persists across sessions)
export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
}

// Get device category from user agent
export function getDeviceCategory(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Get UTM params from URL
export function getUtmParams(): Record<string, string | null> {
  if (typeof window === 'undefined') return {};
  
  const params = new URLSearchParams(window.location.search);
  const utms: Record<string, string | null> = {};
  
  for (const key of UTM_KEYS) {
    utms[key] = params.get(key) || null;
  }
  utms.fbclid = params.get('fbclid') || null;
  
  return utms;
}

// Get Meta cookies (fbc, fbp)
export function getMetaCookies(): { fbc: string | null; fbp: string | null } {
  if (typeof window === 'undefined') return { fbc: null, fbp: null };
  
  const cookies = document.cookie.split(';').reduce((acc, c) => {
    const [key, val] = c.trim().split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>);
  
  return {
    fbc: cookies['_fbc'] || null,
    fbp: cookies['_fbp'] || null,
  };
}

// Store UTMs in localStorage for persistence across navigation
export function persistUtms(): void {
  if (typeof window === 'undefined') return;
  
  const utms = getUtmParams();
  for (const [key, value] of Object.entries(utms)) {
    if (value) {
      localStorage.setItem(`afal_${key}`, value);
    }
  }
}

// Get persisted UTMs (fallback if URL params are gone)
export function getPersistedUtms(): Record<string, string | null> {
  if (typeof window === 'undefined') return {};
  
  const utms: Record<string, string | null> = {};
  for (const key of [...UTM_KEYS, 'fbclid']) {
    utms[key] = localStorage.getItem(`afal_${key}`) || null;
  }
  return utms;
}

// Check if we can reuse existing session (within 30 min, same product)
function canReuseSession(productId: string | null): boolean {
  if (typeof window === 'undefined') return false;
  
  const existingSessionId = sessionStorage.getItem(SESSION_ID_KEY);
  const existingProductId = sessionStorage.getItem(SESSION_PRODUCT_KEY);
  const createdAt = sessionStorage.getItem(SESSION_CREATED_KEY);
  
  if (!existingSessionId || !createdAt) return false;
  
  // Check if same product
  if (productId && existingProductId && productId !== existingProductId) return false;
  
  // Check if within 30 minutes
  const created = new Date(createdAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - created.getTime()) / (1000 * 60);
  
  return diffMinutes < SESSION_REUSE_MINUTES;
}

// Get current session ID if exists and valid
export function getCurrentSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(SESSION_ID_KEY);
}

// Create or reuse session for LP visit
export async function createOrReuseSession(
  productId: string | null,
  lpSlug: string | null
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  // Check if we can reuse existing session
  if (canReuseSession(productId)) {
    return sessionStorage.getItem(SESSION_ID_KEY);
  }
  
  // Basic rate-limit check: max 10 sessions per minute per visitor
  const rateLimitKey = 'afal_session_rate';
  const rateLimitData = localStorage.getItem(rateLimitKey);
  const now = Date.now();
  let recentCount = 0;
  
  if (rateLimitData) {
    try {
      const { count, resetAt } = JSON.parse(rateLimitData);
      if (now < resetAt) {
        recentCount = count;
        if (recentCount >= 10) {
          console.warn('[Session] Rate limit exceeded, skipping session creation');
          return null;
        }
      }
    } catch (e) {
      // Invalid data, reset
    }
  }
  
  // Update rate limit counter
  localStorage.setItem(rateLimitKey, JSON.stringify({
    count: recentCount + 1,
    resetAt: now + 60000, // Reset after 1 minute
  }));
  
  // Persist UTMs from URL
  persistUtms();
  
  // Get all attribution data
  const visitorId = getVisitorId();
  const utms = getUtmParams();
  const persistedUtms = getPersistedUtms();
  const metaCookies = getMetaCookies();
  const deviceCategory = getDeviceCategory();
  
  // Merge URL UTMs with persisted (URL takes precedence)
  const finalUtms = {
    utm_source: utms.utm_source || persistedUtms.utm_source,
    utm_medium: utms.utm_medium || persistedUtms.utm_medium,
    utm_campaign: utms.utm_campaign || persistedUtms.utm_campaign,
    utm_content: utms.utm_content || persistedUtms.utm_content,
    utm_term: utms.utm_term || persistedUtms.utm_term,
    fbclid: utms.fbclid || persistedUtms.fbclid,
  };
  
  try {
    const { data, error } = await supabaseBrowser
      .from('sessions')
      .insert({
        visitor_id: visitorId,
        entry_product_id: productId,
        entry_lp_slug: lpSlug,
        utm_source: finalUtms.utm_source,
        utm_medium: finalUtms.utm_medium,
        utm_campaign: finalUtms.utm_campaign,
        utm_content: finalUtms.utm_content,
        utm_term: finalUtms.utm_term,
        fbclid: finalUtms.fbclid,
        fbc: metaCookies.fbc,
        fbp: metaCookies.fbp,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        device_category: deviceCategory,
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[Session] Failed to create session:', error);
      return null;
    }
    
    // Store session info
    sessionStorage.setItem(SESSION_ID_KEY, data.id);
    if (productId) sessionStorage.setItem(SESSION_PRODUCT_KEY, productId);
    sessionStorage.setItem(SESSION_CREATED_KEY, new Date().toISOString());
    
    return data.id;
  } catch (e) {
    console.error('[Session] Error creating session:', e);
    return null;
  }
}

// Log LP event (view_content, initiate_checkout, purchase)
export async function logLpEvent(
  eventType: 'view_content' | 'initiate_checkout' | 'purchase',
  options: {
    sessionId?: string | null;
    orderId?: string | null;
    metadata?: Record<string, any>;
    pixelAttempted?: boolean;
    pixelLoaded?: boolean;
    pixelBlocked?: boolean;
    pixelErrorCode?: string | null;
  } = {}
): Promise<boolean> {
  const sessionId = options.sessionId || getCurrentSessionId();
  if (!sessionId) {
    console.warn('[Session] No session ID for event:', eventType);
    return false;
  }
  
  // Generate event_id for dedupe (consistent format)
  // view_content: ${sessionId}:view_content
  // initiate_checkout: ${sessionId}:initiate_checkout:first
  // purchase: ${orderId} (server-authoritative, but client can attempt)
  let eventId: string;
  if (eventType === 'purchase' && options.orderId) {
    eventId = options.orderId;
  } else if (eventType === 'initiate_checkout') {
    eventId = `${sessionId}:initiate_checkout:first`;
  } else {
    eventId = `${sessionId}:${eventType}`;
  }
  
  try {
    // Use upsert with onConflict to handle retries gracefully (no errors on duplicate)
    const { error } = await supabaseBrowser
      .from('lp_events')
      .upsert({
        session_id: sessionId,
        event_type: eventType,
        event_id: eventId,
        order_id: options.orderId || null,
        pixel_attempted_at: options.pixelAttempted ? new Date().toISOString() : null,
        pixel_loaded: options.pixelLoaded ?? null,
        pixel_blocked_suspected: options.pixelBlocked ?? null,
        pixel_error_code: options.pixelErrorCode || null,
        metadata: options.metadata || null,
      }, { onConflict: 'event_id' });
    
    if (error) {
      console.error('[Session] Failed to log event:', error);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('[Session] Error logging event:', e);
    return false;
  }
}

// Update session checkout count
export async function updateCheckoutCount(sessionId: string): Promise<void> {
  try {
    // First get current count
    const { data } = await supabaseBrowser
      .from('sessions')
      .select('checkout_open_count, first_checkout_at')
      .eq('id', sessionId)
      .single();
    
    const updates: any = {
      checkout_open_count: (data?.checkout_open_count || 0) + 1,
    };
    
    if (!data?.first_checkout_at) {
      updates.first_checkout_at = new Date().toISOString();
    }
    
    await supabaseBrowser
      .from('sessions')
      .update(updates)
      .eq('id', sessionId);
  } catch (e) {
    console.error('[Session] Error updating checkout count:', e);
  }
}

// Get attribution data for order creation (server-side fallback)
export function getAttributionDataForOrder(): Record<string, string | null> {
  if (typeof window === 'undefined') return {};
  
  const sessionId = getCurrentSessionId();
  const visitorId = getVisitorId();
  const utms = getPersistedUtms();
  const metaCookies = getMetaCookies();
  
  return {
    attribution_session_id: sessionId,
    visitor_id: visitorId, // For last-touch fallback on server
    utm_source: utms.utm_source,
    utm_medium: utms.utm_medium,
    utm_campaign: utms.utm_campaign,
    utm_content: utms.utm_content,
    utm_term: utms.utm_term,
    fbclid: utms.fbclid,
    fbc: metaCookies.fbc,
    fbp: metaCookies.fbp,
    referrer: document.referrer || null,
    entry_lp_slug: sessionStorage.getItem(SESSION_PRODUCT_KEY) ? 
      localStorage.getItem('afal_entry_lp_slug') : null,
    device_category: getDeviceCategory(),
  };
}
