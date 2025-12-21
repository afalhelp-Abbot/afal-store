// Simple Meta Pixel helper usable from client components
// Ensures fbq is initialized once per page with the given pixel ID

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

export function ensurePixel(pixelId?: string | null) {
  if (!pixelId) {
    return false;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const w = window as any;
  // Load script if fbq not present
  if (!w.fbq) {
    // Safe stub based on Meta's recommended pattern, but without mutating
    // function properties that can be read-only in some environments.
    const queue: any[] = [];
    const fbq: any = function(this: any) {
      queue.push(arguments as any);
    };
    fbq.queue = queue;
    fbq.loaded = true;
    fbq.version = '2.0';
    w.fbq = fbq;
    if (!w._fbq) w._fbq = fbq;
    const s = document.createElement('script');
    s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(s, first);
    else document.head.appendChild(s);
  }
  try {
    w.fbq('init', String(pixelId));
    return true;
  } catch {
    return false;
  }
}

type TrackOptions = { eventID?: string };

export function track(event: string, params?: Record<string, any>, options?: TrackOptions) {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (!w.fbq) return false;
  try {
    let eventID = options?.eventID;

    // Backward-compat: if callers passed event_id inside params, convert to eventID
    if (!eventID && params && typeof (params as any).event_id !== 'undefined') {
      eventID = String((params as any).event_id);
      const { event_id, ...rest } = params as any;
      params = rest;
    }

    if (eventID) {
      w.fbq('track', event, params || {}, { eventID });
    } else {
      w.fbq('track', event, params || {});
    }
    return true;
  } catch {
    return false;
  }
}
