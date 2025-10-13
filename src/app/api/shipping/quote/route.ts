import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// Types for request payload
// {
//   product_id: string,
//   province_code?: string,
//   city?: string,
//   coupon?: string,
//   items: Array<{ variant_id: string; qty: number }>,
//   total_weight_kg?: number,
//   subtotal: number
// }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productId: string | undefined = body?.product_id;
    const provinceCode: string | undefined = body?.province_code || undefined;
    const cityName: string | undefined = body?.city || undefined;
    const coupon: string | undefined = body?.coupon || undefined;
    const items: Array<{ variant_id: string; qty: number }> = Array.isArray(body?.items) ? body.items : [];
    const subtotal: number = Number(body?.subtotal || 0) || 0;
    const totalWeightKg: number = Number(body?.total_weight_kg || 0) || 0;

    if (!productId) return NextResponse.json({ error: 'product_id required' }, { status: 400 });

    const supabase = getSupabaseServerClient();

    // Load settings
    const { data: settings } = await supabase
      .from('shipping_settings')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();

    // Resolve city_id if provided
    let cityId: number | null = null;
    if (cityName && provinceCode) {
      const { data: cityRow } = await supabase
        .from('cities')
        .select('id')
        .eq('province_code', provinceCode)
        .ilike('name', cityName)
        .maybeSingle();
      if (cityRow?.id) cityId = cityRow.id as number;
    }

    // Fetch rules for scope
    const scopes: any[] = [];
    // Prioritize city scope if applicable
    if (cityId) scopes.push({ city_id: cityId });
    if (provinceCode) scopes.push({ province_code: provinceCode, city_id: null });

    // Always also load all product rules (we'll sort client-side by precedence)
    const { data: ruleRows } = await supabase
      .from('shipping_rules')
      .select('*')
      .eq('product_id', productId)
      .eq('enabled', true);

    const now = Date.now();
    const eligible = (ruleRows || []).filter((r: any) => {
      // scope match
      const scopeMatch = (
        (cityId && r.city_id === cityId) ||
        (provinceCode && r.city_id == null && r.province_code === provinceCode) ||
        (!provinceCode && !cityId && r.city_id == null && r.province_code == null)
      );
      if (!scopeMatch) return false;
      // window
      const af = r.active_from ? new Date(r.active_from).getTime() : null;
      const at = r.active_to ? new Date(r.active_to).getTime() : null;
      if (af && now < af) return false;
      if (at && now > at) return false;
      // min subtotal
      if (r.min_subtotal != null && Number(subtotal) < Number(r.min_subtotal)) return false;
      // coupon rule only applies when coupon provided
      if (r.mode === 'coupon_free' && (!coupon || (r.coupon_code || '').toLowerCase() !== String(coupon || '').toLowerCase())) return false;
      return true;
    });

    // Sort precedence: city first (has city_id), then province, then by priority desc
    eligible.sort((a: any, b: any) => {
      const aCity = a.city_id ? 1 : 0; const bCity = b.city_id ? 1 : 0;
      if (aCity !== bCity) return bCity - aCity;
      const aProv = a.province_code ? 1 : 0; const bProv = b.province_code ? 1 : 0;
      if (aProv !== bProv) return bProv - aProv;
      return Number(b.priority || 0) - Number(a.priority || 0);
    });

    const chooseAmountForRule = (r: any): { amount: number; eta?: number } => {
      const eta = (r.eta_days != null) ? Number(r.eta_days) : undefined;
      switch (r.mode) {
        case 'free':
          return { amount: 0, eta };
        case 'coupon_free':
          return { amount: 0, eta };
        case 'flat':
          return { amount: Number(r.flat_amount || 0), eta };
        case 'per_item': {
          const totalQty = items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
          return { amount: Number(r.per_item_amount || 0) * totalQty, eta };
        }
        case 'per_kg': {
          const base = Number(r.base_amount || 0);
          const perKg = Number(r.per_kg_amount || 0);
          return { amount: base + perKg * Number(totalWeightKg || 0), eta };
        }
        default:
          return { amount: 0, eta };
      }
    };

    let chosen: { amount: number; eta?: number } | null = null;

    if (eligible.length > 0) {
      chosen = chooseAmountForRule(eligible[0]);
    } else if (settings) {
      // Apply free_over_subtotal first
      if (settings.free_over_subtotal != null && Number(subtotal) >= Number(settings.free_over_subtotal)) {
        chosen = { amount: 0, eta: undefined };
      } else {
        const fallbackMode = settings.fallback_mode as string;
        const r = {
          mode: fallbackMode,
          flat_amount: settings.fallback_flat_amount,
          per_item_amount: settings.fallback_per_item_amount,
          base_amount: settings.fallback_base_amount,
          per_kg_amount: settings.fallback_per_kg_amount,
          eta_days: null
        } as any;
        chosen = chooseAmountForRule(r);
      }
    } else {
      chosen = { amount: 0, eta: undefined };
    }

    // Append COD fee if configured
    let amount = Number(chosen?.amount || 0);
    if (settings?.cod_fee) amount += Number(settings.cod_fee);

    return NextResponse.json({ amount, eta_days: chosen?.eta ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
