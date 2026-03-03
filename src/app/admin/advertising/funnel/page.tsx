'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

type FunnelData = {
  product_id: string | null;
  product_name: string | null;
  lp_slug: string | null;
  view_content: number;
  initiate_checkout: number;
  purchase: number;
  view_to_checkout_rate: number;
  checkout_to_purchase_rate: number;
  overall_conversion_rate: number;
};

type DateRange = '7d' | '14d' | '30d' | 'all';

export default function FunnelPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FunnelData[]>([]);
  const [totals, setTotals] = useState<FunnelData | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [groupBy, setGroupBy] = useState<'product' | 'device'>('product');
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  
  // Fallback context: orders data even when funnel events are empty
  const [fallbackOrders, setFallbackOrders] = useState({ count: 0, revenue: 0 });

  useEffect(() => {
    loadData();
  }, [dateRange, groupBy]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate date filter
      let dateFilter: string | null = null;
      const now = new Date();
      if (dateRange === '7d') {
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateRange === '14d') {
        dateFilter = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      } else if (dateRange === '30d') {
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      // Fetch events with session data
      let query = supabaseBrowser
        .from('lp_events')
        .select(`
          event_type,
          created_at,
          session:sessions!inner(
            entry_product_id,
            entry_lp_slug,
            device_category
          )
        `);

      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }

      const { data: events, error: eventsError } = await query;

      if (eventsError) throw eventsError;

      // Fetch products for names
      const { data: products } = await supabaseBrowser
        .from('products')
        .select('id, name, slug');

      const productMap = new Map((products || []).map(p => [p.id, p]));

      // Group events
      const grouped = new Map<string, { view: number; checkout: number; purchase: number; name: string | null; slug: string | null }>();

      let totalView = 0;
      let totalCheckout = 0;
      let totalPurchase = 0;

      for (const event of events || []) {
        const session = event.session as any;
        let key: string;
        let name: string | null = null;
        let slug: string | null = null;

        if (groupBy === 'product') {
          key = session?.entry_product_id || '(unknown)';
          const product = productMap.get(key);
          name = product?.name || null;
          slug = session?.entry_lp_slug || product?.slug || null;
        } else {
          key = session?.device_category || '(unknown)';
          name = key;
          slug = null;
        }

        const existing = grouped.get(key) || { view: 0, checkout: 0, purchase: 0, name, slug };

        if (event.event_type === 'view_content') {
          existing.view += 1;
          totalView += 1;
        } else if (event.event_type === 'initiate_checkout') {
          existing.checkout += 1;
          totalCheckout += 1;
        } else if (event.event_type === 'purchase') {
          existing.purchase += 1;
          totalPurchase += 1;
        }

        grouped.set(key, existing);
      }

      // Convert to array with rates
      const result: FunnelData[] = Array.from(grouped.entries())
        .map(([productId, val]) => ({
          product_id: groupBy === 'product' ? productId : null,
          product_name: val.name,
          lp_slug: val.slug,
          view_content: val.view,
          initiate_checkout: val.checkout,
          purchase: val.purchase,
          view_to_checkout_rate: val.view > 0 ? (val.checkout / val.view) * 100 : 0,
          checkout_to_purchase_rate: val.checkout > 0 ? (val.purchase / val.checkout) * 100 : 0,
          overall_conversion_rate: val.view > 0 ? (val.purchase / val.view) * 100 : 0,
        }))
        .sort((a, b) => b.view_content - a.view_content);

      // Calculate totals
      const totalData: FunnelData = {
        product_id: null,
        product_name: 'All Products',
        lp_slug: null,
        view_content: totalView,
        initiate_checkout: totalCheckout,
        purchase: totalPurchase,
        view_to_checkout_rate: totalView > 0 ? (totalCheckout / totalView) * 100 : 0,
        checkout_to_purchase_rate: totalCheckout > 0 ? (totalPurchase / totalCheckout) * 100 : 0,
        overall_conversion_rate: totalView > 0 ? (totalPurchase / totalView) * 100 : 0,
      };

      setData(result);
      setTotals(totalData);

      // Fetch fallback orders data (always available even without funnel events)
      let ordersQuery = supabaseBrowser
        .from('orders')
        .select('id, shipping_amount')
        .not('status', 'eq', 'cancelled');
      
      if (dateFilter) {
        ordersQuery = ordersQuery.gte('created_at', dateFilter);
      }
      
      const { data: orders } = await ordersQuery;
      
      if (orders && orders.length > 0) {
        const orderIds = orders.map((o: any) => o.id);
        const { data: lines } = await supabaseBrowser
          .from('order_lines')
          .select('order_id, line_total')
          .in('order_id', orderIds);
        
        let totalRevenue = 0;
        for (const order of orders) {
          const orderLines = (lines || []).filter((l: any) => l.order_id === order.id);
          const lineTotal = orderLines.reduce((sum: number, l: any) => sum + Number(l.line_total || 0), 0);
          totalRevenue += lineTotal + Number(order.shipping_amount || 0);
        }
        
        setFallbackOrders({ count: orders.length, revenue: totalRevenue });
      } else {
        setFallbackOrders({ count: 0, revenue: 0 });
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load funnel data');
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Funnel</h1>
          <p className="text-sm text-gray-600">Conversion rates from LP view → checkout → purchase</p>
        </div>
        <Link href="/admin/advertising" className="text-sm text-blue-600 hover:underline">
          ← Back to Advertising
        </Link>
      </div>

      {/* Collapsible Help Box */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-yellow-100 transition-colors rounded-lg"
        >
          <div>
            <span className="font-medium text-yellow-900">📖 How to read the funnel</span>
            <span className="text-yellow-700 text-sm ml-2">/ فنل کیسے پڑھیں</span>
          </div>
          <span className="text-yellow-600">{showHelp ? '▲ Hide' : '▼ Show'}</span>
        </button>
        
        {showHelp && (
          <div className="px-5 pb-5 border-t border-yellow-200">
            <div className="grid md:grid-cols-2 gap-6 pt-4">
              {/* English */}
              <div className="space-y-3">
                <h4 className="font-semibold text-yellow-900 text-sm">English</h4>
                <div>
                  <p className="text-sm font-medium text-yellow-800">What this shows</p>
                  <p className="text-xs text-yellow-700">LP Views → Checkouts → Purchases</p>
                  <p className="text-xs text-yellow-700">Find where customers drop off</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800">Low Views → Checkouts?</p>
                  <p className="text-xs text-yellow-700">LP problem. Fix: stronger offer, clearer CTA, trust signals</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800">Low Checkouts → Purchases?</p>
                  <p className="text-xs text-yellow-700">Checkout problem. Fix: simplify form, reduce steps</p>
                </div>
              </div>
              {/* Urdu */}
              <div className="space-y-3">
                <h4 className="font-semibold text-yellow-900 text-sm">اردو</h4>
                <div>
                  <p className="text-sm font-medium text-yellow-800">یہ کیا دکھاتا ہے</p>
                  <p className="text-xs text-yellow-700">LP Views → Checkouts → Purchases</p>
                  <p className="text-xs text-yellow-700">لوگ کس مرحلے پر رک رہے ہیں</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800">Views → Checkouts کم؟</p>
                  <p className="text-xs text-yellow-700">LP مسئلہ۔ حل: بہتر آفر/CTA، ٹرسٹ بیجز</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800">Checkouts → Purchases کم؟</p>
                  <p className="text-xs text-yellow-700">چیک آؤٹ مسئلہ۔ حل: فارم آسان، کم سٹیپس</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Group by</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="product">Product / LP</option>
            <option value="device">Device</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Date range</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="14d">Last 14 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {/* Rollout banner when no funnel events but orders exist */}
      {!loading && totals && totals.view_content === 0 && totals.initiate_checkout === 0 && totals.purchase === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 mb-1">Funnel data collection in progress</h4>
              <p className="text-amber-800 text-sm mb-2">
                Funnel requires sessions + lp_events. Tracking deployed but no events yet.
              </p>
              <p className="text-amber-700 text-sm mb-3">
                فنل کے لیے سیشنز + ایونٹس درکار۔ ٹریکنگ لگا دی گئی لیکن ابھی کوئی ایونٹ نہیں۔
              </p>
              
              {/* Fallback context: show orders data */}
              {fallbackOrders.count > 0 && (
                <div className="bg-white border border-amber-200 rounded p-3 mt-2">
                  <p className="text-sm font-medium text-gray-700 mb-2">📊 Orders data available (for reference):</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="font-bold text-lg">{fallbackOrders.count}</span>
                      <span className="text-gray-600 ml-1">Orders</span>
                    </div>
                    <div>
                      <span className="font-bold text-lg">PKR {fallbackOrders.revenue.toLocaleString()}</span>
                      <span className="text-gray-600 ml-1">Revenue</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Funnel steps will populate once LP visits are tracked.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Overall funnel visualization */}
      {totals && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="font-medium mb-4">Overall Funnel</h3>
          <div className="flex items-center justify-between gap-4">
            {/* View Content */}
            <div className="flex-1 text-center">
              <div className="text-3xl font-bold text-blue-600">{totals.view_content}</div>
              <div className="text-sm text-gray-600">LP Views</div>
            </div>

            {/* Arrow + Rate */}
            <div className="text-center">
              <div className="text-2xl text-gray-400">→</div>
              <div className="text-xs text-gray-500">{formatPercent(totals.view_to_checkout_rate)}</div>
            </div>

            {/* Initiate Checkout */}
            <div className="flex-1 text-center">
              <div className="text-3xl font-bold text-yellow-600">{totals.initiate_checkout}</div>
              <div className="text-sm text-gray-600">Checkouts</div>
            </div>

            {/* Arrow + Rate */}
            <div className="text-center">
              <div className="text-2xl text-gray-400">→</div>
              <div className="text-xs text-gray-500">{formatPercent(totals.checkout_to_purchase_rate)}</div>
            </div>

            {/* Purchase */}
            <div className="flex-1 text-center">
              <div className="text-3xl font-bold text-green-600">{totals.purchase}</div>
              <div className="text-sm text-gray-600">Purchases</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t text-center">
            <span className="text-sm text-gray-600">Overall Conversion Rate: </span>
            <span className="font-bold text-green-600">{formatPercent(totals.overall_conversion_rate)}</span>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No funnel data found for the selected period.
            <br />
            <span className="text-sm">Data will appear once sessions are tracked on LP visits.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">
                  {groupBy === 'product' ? 'Product / LP' : 'Device'}
                </th>
                <th className="text-right px-4 py-3 font-medium">Views</th>
                <th className="text-right px-4 py-3 font-medium">Checkouts</th>
                <th className="text-right px-4 py-3 font-medium">Purchases</th>
                <th className="text-right px-4 py-3 font-medium">View → Checkout</th>
                <th className="text-right px-4 py-3 font-medium">Checkout → Purchase</th>
                <th className="text-right px-4 py-3 font-medium">Overall CVR</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.product_name || row.product_id || '(unknown)'}</div>
                    {row.lp_slug && (
                      <div className="text-xs text-gray-500">/lp/{row.lp_slug}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{row.view_content}</td>
                  <td className="px-4 py-3 text-right">{row.initiate_checkout}</td>
                  <td className="px-4 py-3 text-right">{row.purchase}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatPercent(row.view_to_checkout_rate)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatPercent(row.checkout_to_purchase_rate)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">{formatPercent(row.overall_conversion_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
