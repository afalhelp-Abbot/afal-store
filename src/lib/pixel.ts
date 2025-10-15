// Simple Meta Pixel helper usable from client components
// Ensures fbq is initialized once per page with the given pixel ID

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

export function ensurePixel(pixelId?: string | null) {
  if (!pixelId) return false;
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const w = window as any;
  // Load script if fbq not present
  if (!w.fbq) {
    const fbq: any = function(this: any) {
      (fbq.callMethod ? fbq.callMethod : fbq.queue.push).apply(fbq, arguments as any);
    };
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
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

export function track(event: string, params?: Record<string, any>) {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (!w.fbq) return false;
  try { w.fbq('track', event, params || {}); return true; } catch { return false; }
}
