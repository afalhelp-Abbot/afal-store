declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

let gaScriptLoaded = false;
const configuredIds = new Set<string>();

export type Ga4GlobalConfig = {
  ga4_measurement_id: string | null;
  ga4_enabled_default: boolean | null;
};

export type Ga4ProductOverride = {
  ga4_enabled_override: boolean | null;
  ga4_measurement_id_override: string | null;
};

export function computeEffectiveGaId(
  globalCfg: Ga4GlobalConfig | null,
  productCfg: Ga4ProductOverride | null,
): string | null {
  const overrideEnabled = productCfg?.ga4_enabled_override;
  const overrideIdRaw = productCfg?.ga4_measurement_id_override || null;
  const overrideId = overrideIdRaw && overrideIdRaw.trim() ? overrideIdRaw.trim() : null;

  if (overrideEnabled === true && overrideId) {
    return overrideId;
  }

  const globalIdRaw = globalCfg?.ga4_measurement_id || null;
  const globalId = globalIdRaw && globalIdRaw.trim() ? globalIdRaw.trim() : null;
  const globalEnabled = !!globalCfg?.ga4_enabled_default;

  if (globalEnabled && globalId) {
    return globalId;
  }

  return null;
}

export function ensureGa4(measurementId: string | null | undefined): boolean {
  if (!measurementId) return false;
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const id = String(measurementId).trim();
  if (!id) return false;

  const w = window as Window;

  if (!w.dataLayer) {
    w.dataLayer = [];
  }
  if (!w.gtag) {
    w.gtag = function gtag() {
      w.dataLayer!.push(arguments as any);
    };
  }

  if (!gaScriptLoaded) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    const first = document.getElementsByTagName("script")[0];
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else document.head.appendChild(script);
    gaScriptLoaded = true;
  }

  if (!configuredIds.has(id)) {
    w.gtag!("js", new Date());
    w.gtag!("config", id, { send_page_view: false });
    configuredIds.add(id);
  }

  return true;
}

export function ga4Event(measurementId: string | null | undefined, name: string, params?: Record<string, any>): boolean {
  if (!ensureGa4(measurementId)) return false;
  try {
    const w = window as Window;
    w.gtag!("event", name, params || {});
    return true;
  } catch {
    return false;
  }
}

const PURCHASE_KEY_PREFIX = "ga4_purchase_";

export function hasPurchaseFired(orderId: string | number): boolean {
  if (typeof window === "undefined") return false;
  const key = PURCHASE_KEY_PREFIX + String(orderId);
  try {
    const stored = window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
    return stored === "1";
  } catch {
    return false;
  }
}

export function markPurchaseFired(orderId: string | number): void {
  if (typeof window === "undefined") return;
  const key = PURCHASE_KEY_PREFIX + String(orderId);
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }
}
