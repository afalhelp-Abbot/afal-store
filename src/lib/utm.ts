'use client';

// Keys we care about
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type UTM = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export function setUTMFromURLOnce() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of UTM_KEYS) {
      const val = url.searchParams.get(key);
      if (val && !localStorage.getItem(key)) {
        localStorage.setItem(key, val);
        changed = true;
      }
    }
    // Optional: also persist referrer
    const ref = url.searchParams.get('ref') || document.referrer;
    if (ref && !localStorage.getItem('ref')) {
      localStorage.setItem('ref', ref);
      changed = true;
    }
    return changed;
  } catch {
    // ignore
  }
}

export function getUTM(): UTM {
  if (typeof window === 'undefined') return {};
  const out: UTM = {};
  for (const key of UTM_KEYS) {
    const v = localStorage.getItem(key) || undefined;
    if (v) out[key] = v;
  }
  return out;
}
