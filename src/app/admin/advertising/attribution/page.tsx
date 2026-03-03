'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

type AttributionRow = {
  utm_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  device_category: string | null;
  entry_lp_slug: string | null;
  order_count: number;
  total_revenue: number;
};

type SessionRow = {
  utm_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  device_category: string | null;
  entry_lp_slug: string | null;
  session_count: number;
};

type DateRange = '7d' | '14d' | '30d' | 'all';
type ViewMode = 'orders' | 'sessions';

export default function AttributionPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AttributionRow[]>([]);
  const [sessionData, setSessionData] = useState<SessionRow[]>([]);
  const [groupBy, setGroupBy] = useState<'campaign' | 'source' | 'device' | 'lp'>('campaign');
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [viewMode, setViewMode] = useState<ViewMode>('orders');
  const [error, setError] = useState<string | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  
  // Data quality metrics
  const [dataQuality, setDataQuality] = useState({
    ordersWithCampaign: 0,
    ordersTotal: 0,
    ordersWithSession: 0,
    sessionsWithCampaign: 0,
    sessionsTotal: 0,
  });
  
  // UI state
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    loadData();
  }, [groupBy, dateRange, viewMode]);

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

      // Fetch orders with attribution data (include attribution_session_id for quality metrics)
      let query = supabaseBrowser
        .from('orders')
        .select('id, utm_campaign, utm_source, utm_medium, device_category, entry_lp_slug, created_at, shipping_amount, discount_total, attribution_session_id')
        .not('status', 'eq', 'cancelled');

      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }

      const { data: orders, error: ordersError } = await query;

      if (ordersError) throw ordersError;

      // Fetch order totals from order_lines
      const orderIds = (orders || []).map((o: any) => o.id);
      const { data: lines } = await supabaseBrowser
        .from('order_lines')
        .select('order_id, line_total')
        .in('order_id', orderIds);

      // Calculate totals per order
      const orderTotals: Record<string, number> = {};
      for (const line of lines || []) {
        const oid = (line as any).order_id;
        orderTotals[oid] = (orderTotals[oid] || 0) + Number((line as any).line_total || 0);
      }

      // Add shipping to totals
      for (const order of orders || []) {
        orderTotals[order.id] = (orderTotals[order.id] || 0) + Number(order.shipping_amount || 0);
      }

      // Group data based on selected grouping
      const grouped = new Map<string, { count: number; revenue: number; row: Partial<AttributionRow> }>();

      for (const order of orders || []) {
        let key: string;
        let row: Partial<AttributionRow>;
        const orderTotal = orderTotals[order.id] || 0;

        switch (groupBy) {
          case 'campaign':
            key = order.utm_campaign || '(no campaign)';
            row = { utm_campaign: order.utm_campaign, utm_source: order.utm_source, utm_medium: order.utm_medium };
            break;
          case 'source':
            key = order.utm_source || '(no source)';
            row = { utm_source: order.utm_source, utm_medium: order.utm_medium };
            break;
          case 'device':
            key = order.device_category || '(unknown)';
            row = { device_category: order.device_category };
            break;
          case 'lp':
            key = order.entry_lp_slug || '(no LP)';
            row = { entry_lp_slug: order.entry_lp_slug };
            break;
          default:
            key = '(unknown)';
            row = {};
        }

        const existing = grouped.get(key) || { count: 0, revenue: 0, row };
        existing.count += 1;
        existing.revenue += orderTotal;
        grouped.set(key, existing);
      }

      // Convert to array and sort by revenue
      const result: AttributionRow[] = Array.from(grouped.entries())
        .map(([key, val]) => ({
          ...val.row,
          order_count: val.count,
          total_revenue: val.revenue,
        } as AttributionRow))
        .sort((a, b) => b.total_revenue - a.total_revenue);

      setData(result);

      // Also fetch sessions data for traffic view
      let sessionsQuery = supabaseBrowser
        .from('sessions')
        .select('id, utm_campaign, utm_source, utm_medium, device_category, entry_lp_slug, created_at');

      if (dateFilter) {
        sessionsQuery = sessionsQuery.gte('created_at', dateFilter);
      }

      const { data: sessions, error: sessionsError } = await sessionsQuery;

      if (!sessionsError && sessions) {
        setTotalSessions(sessions.length);

        // Group sessions
        const sessionGrouped = new Map<string, { count: number; row: Partial<SessionRow> }>();

        for (const session of sessions) {
          let key: string;
          let row: Partial<SessionRow>;

          switch (groupBy) {
            case 'campaign':
              key = session.utm_campaign || '(no campaign)';
              row = { utm_campaign: session.utm_campaign, utm_source: session.utm_source, utm_medium: session.utm_medium };
              break;
            case 'source':
              key = session.utm_source || '(no source)';
              row = { utm_source: session.utm_source, utm_medium: session.utm_medium };
              break;
            case 'device':
              key = session.device_category || '(unknown)';
              row = { device_category: session.device_category };
              break;
            case 'lp':
              key = session.entry_lp_slug || '(no LP)';
              row = { entry_lp_slug: session.entry_lp_slug };
              break;
            default:
              key = '(unknown)';
              row = {};
          }

          const existing = sessionGrouped.get(key) || { count: 0, row };
          existing.count += 1;
          sessionGrouped.set(key, existing);
        }

        const sessionResult: SessionRow[] = Array.from(sessionGrouped.entries())
          .map(([key, val]) => ({
            ...val.row,
            session_count: val.count,
          } as SessionRow))
          .sort((a, b) => b.session_count - a.session_count);

        setSessionData(sessionResult);

        // Calculate data quality metrics
        const ordersWithCampaign = (orders || []).filter((o: any) => o.utm_campaign).length;
        const ordersWithSession = (orders || []).filter((o: any) => o.attribution_session_id).length;
        const sessionsWithCampaign = sessions.filter((s: any) => s.utm_campaign).length;
        
        setDataQuality({
          ordersWithCampaign,
          ordersTotal: (orders || []).length,
          ordersWithSession,
          sessionsWithCampaign,
          sessionsTotal: sessions.length,
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load attribution data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `PKR ${amount.toLocaleString()}`;
  };

  const getGroupLabel = (row: AttributionRow): string => {
    switch (groupBy) {
      case 'campaign':
        return row.utm_campaign || '(no campaign)';
      case 'source':
        return row.utm_source || '(no source)';
      case 'device':
        return row.device_category || '(unknown)';
      case 'lp':
        return row.entry_lp_slug || '(no LP)';
      default:
        return '(unknown)';
    }
  };

  const totalOrders = data.reduce((sum, r) => sum + r.order_count, 0);
  const totalRevenue = data.reduce((sum, r) => sum + r.total_revenue, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Attribution</h1>
          <p className="text-sm text-gray-600">Orders and revenue by campaign, source, device, or LP</p>
        </div>
        <Link href="/admin/advertising" className="text-sm text-blue-600 hover:underline">
          ← Back to Advertising
        </Link>
      </div>

      {/* Collapsible Help Box */}
      <div className="bg-green-50 border border-green-200 rounded-lg">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-green-100 transition-colors rounded-lg"
        >
          <div>
            <span className="font-medium text-green-900">📖 How to use this page</span>
            <span className="text-green-700 text-sm ml-2">/ اس صفحے کو کیسے استعمال کریں</span>
          </div>
          <span className="text-green-600">{showHelp ? '▲ Hide' : '▼ Show'}</span>
        </button>
        
        {showHelp && (
          <div className="px-5 pb-5 border-t border-green-200">
            <div className="grid md:grid-cols-2 gap-6 pt-4">
              {/* English */}
              <div className="space-y-3">
                <h4 className="font-semibold text-green-900 text-sm">English</h4>
                <div>
                  <p className="text-sm font-medium text-green-800">1. Choose View</p>
                  <p className="text-xs text-green-700">Orders View = Revenue + Orders (server truth)</p>
                  <p className="text-xs text-green-700">Sessions View = Visits / Traffic (who came to LP)</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">2. Pick "Group by"</p>
                  <p className="text-xs text-green-700">Campaign = which ad | Source = FB/Google | Device = Mobile/Desktop | LP = landing page</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">3. Read the table</p>
                  <p className="text-xs text-green-700">Highest Revenue + Orders = best performer. "% of Total" = share of sales</p>
                </div>
              </div>
              {/* Urdu */}
              <div className="space-y-3">
                <h4 className="font-semibold text-green-900 text-sm">اردو</h4>
                <div>
                  <p className="text-sm font-medium text-green-800">1. ویو منتخب کریں</p>
                  <p className="text-xs text-green-700">Orders View = سیلز/ریونیو | Sessions View = وزٹس/ٹریفک</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">2. Group by منتخب کریں</p>
                  <p className="text-xs text-green-700">Campaign = کیمپین | Source = فیس بک/گوگل | Device = موبائل/ڈیسک ٹاپ</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">3. ٹیبل پڑھیں</p>
                  <p className="text-xs text-green-700">زیادہ Revenue + Orders = بہترین۔ "% of Total" = حصہ</p>
                </div>
              </div>
            </div>
            
            {/* (no campaign) explanation */}
            <div className="mt-4 pt-4 border-t border-green-200">
              <h4 className="font-semibold text-green-900 text-sm mb-2">"(no campaign)" کیا ہے؟ / What does it mean?</h4>
              <p className="text-xs text-green-800">Order/visit came without UTMs. Fix: Add UTMs to ad links.</p>
              <p className="text-xs text-green-700">لنک میں UTM نہیں تھے۔ حل: ایڈ لنک میں UTM لگائیں۔</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions Box */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500">Quick Actions:</span>
        <button
          onClick={() => {
            const utm = '?utm_source=facebook&utm_medium=paid&utm_campaign=your_campaign&utm_content=ad1';
            navigator.clipboard.writeText(utm);
            alert('UTM template copied!');
          }}
          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          📋 Copy UTM Template
        </button>
        <Link
          href="/admin/products"
          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          ⚙️ Products → Meta Pixel
        </Link>
      </div>

      {/* View Toggle with descriptive labels */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setViewMode('orders')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            viewMode === 'orders'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📦 Orders View
        </button>
        <button
          onClick={() => setViewMode('sessions')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            viewMode === 'sessions'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          👁️ Sessions View
        </button>
        <span className="text-xs text-gray-500 ml-2">
          {viewMode === 'orders' 
            ? '← Revenue + Orders (server truth)' 
            : '← Visits + Conversion Rate (traffic)'}
        </span>
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
            <option value="campaign">Campaign</option>
            <option value="source">Source</option>
            <option value="device">Device</option>
            <option value="lp">Landing Page</option>
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
        <button
          onClick={() => {
            const rows = viewMode === 'orders' ? data : sessionData;
            if (rows.length === 0) return;
            
            const headers = viewMode === 'orders' 
              ? ['Campaign', 'Source', 'Medium', 'Device', 'LP', 'Orders', 'Revenue']
              : ['Campaign', 'Source', 'Medium', 'Device', 'LP', 'Sessions'];
            
            const csvRows = rows.map(row => {
              if (viewMode === 'orders') {
                const r = row as AttributionRow;
                return [r.utm_campaign || '', r.utm_source || '', r.utm_medium || '', r.device_category || '', r.entry_lp_slug || '', r.order_count, r.total_revenue];
              } else {
                const r = row as SessionRow;
                return [r.utm_campaign || '', r.utm_source || '', r.utm_medium || '', r.device_category || '', r.entry_lp_slug || '', r.session_count];
              }
            });
            
            const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `attribution_${viewMode}_${dateRange}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded border"
        >
          📥 Export CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {/* Data Quality Indicators */}
      {!loading && dataQuality.ordersTotal > 0 && (
        <div className="bg-gray-50 border rounded-lg p-4">
          <h4 className="font-medium text-gray-700 mb-3 text-sm">📊 Data Quality / ڈیٹا کوالٹی</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-lg font-semibold">
                {dataQuality.ordersTotal > 0 
                  ? Math.round((dataQuality.ordersWithCampaign / dataQuality.ordersTotal) * 100) 
                  : 0}%
              </div>
              <div className="text-xs text-gray-600">Orders with UTM Campaign</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {dataQuality.ordersTotal > 0 
                  ? Math.round((dataQuality.ordersWithSession / dataQuality.ordersTotal) * 100) 
                  : 0}%
              </div>
              <div className="text-xs text-gray-600">Orders with Session Link</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {dataQuality.sessionsTotal > 0 
                  ? Math.round((dataQuality.sessionsWithCampaign / dataQuality.sessionsTotal) * 100) 
                  : 0}%
              </div>
              <div className="text-xs text-gray-600">Sessions with UTM Campaign</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {dataQuality.ordersTotal > 0 
                  ? Math.round(((dataQuality.ordersTotal - dataQuality.ordersWithSession) / dataQuality.ordersTotal) * 100) 
                  : 0}%
              </div>
              <div className="text-xs text-gray-600">Orders Missing Attribution</div>
            </div>
          </div>
          {dataQuality.ordersWithCampaign < dataQuality.ordersTotal * 0.5 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 p-2 rounded">
              ⚠️ Less than 50% of orders have UTM tracking. Add UTM parameters to your ad links for better attribution.
            </div>
          )}
        </div>
      )}

      {/* Summary cards - Orders View */}
      {viewMode === 'orders' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{totalOrders}</div>
            <div className="text-sm text-gray-600">Total Orders</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{data.length}</div>
            <div className="text-sm text-gray-600">Unique {groupBy === 'campaign' ? 'Campaigns' : groupBy === 'source' ? 'Sources' : groupBy === 'device' ? 'Devices' : 'LPs'}</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">
              {totalOrders > 0 ? formatCurrency(Math.round(totalRevenue / totalOrders)) : 'PKR 0'}
            </div>
            <div className="text-sm text-gray-600">Avg Order Value</div>
          </div>
        </div>
      )}

      {/* Summary cards - Sessions View */}
      {viewMode === 'sessions' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{totalSessions}</div>
            <div className="text-sm text-gray-600">Total Sessions (Visits)</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{sessionData.length}</div>
            <div className="text-sm text-gray-600">Unique {groupBy === 'campaign' ? 'Campaigns' : groupBy === 'source' ? 'Sources' : groupBy === 'device' ? 'Devices' : 'LPs'}</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">{totalOrders}</div>
            <div className="text-sm text-gray-600">Orders (for reference)</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold">
              {totalSessions > 0 ? ((totalOrders / totalSessions) * 100).toFixed(1) : 0}%
            </div>
            <div className="text-sm text-gray-600">Conversion Rate</div>
            <div className="text-xs text-gray-400 mt-1">(Orders ÷ Sessions in same date range)</div>
          </div>
        </div>
      )}

      {/* Data table - Orders View */}
      {viewMode === 'orders' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No attribution data found for the selected period.
              <br />
              <span className="text-sm">Data will appear once sessions are tracked on LP visits.</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">
                    {groupBy === 'campaign' ? 'Campaign' : groupBy === 'source' ? 'Source' : groupBy === 'device' ? 'Device' : 'Landing Page'}
                  </th>
                  {groupBy === 'campaign' && (
                    <th className="text-left px-4 py-3 font-medium">Source / Medium</th>
                  )}
                  <th className="text-right px-4 py-3 font-medium">Orders</th>
                  <th className="text-right px-4 py-3 font-medium">Revenue</th>
                  <th className="text-right px-4 py-3 font-medium">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{getGroupLabel(row)}</td>
                    {groupBy === 'campaign' && (
                      <td className="px-4 py-3 text-gray-600">
                        {row.utm_source || '-'} / {row.utm_medium || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">{row.order_count}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.total_revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {totalRevenue > 0 ? ((row.total_revenue / totalRevenue) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Data table - Sessions View */}
      {viewMode === 'sessions' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : sessionData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No session data found for the selected period.
              <br />
              <span className="text-sm">Sessions will appear once users visit LP pages with tracking enabled.</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">
                    {groupBy === 'campaign' ? 'Campaign' : groupBy === 'source' ? 'Source' : groupBy === 'device' ? 'Device' : 'Landing Page'}
                  </th>
                  {groupBy === 'campaign' && (
                    <th className="text-left px-4 py-3 font-medium">Source / Medium</th>
                  )}
                  <th className="text-right px-4 py-3 font-medium">Sessions</th>
                  <th className="text-right px-4 py-3 font-medium">% of Traffic</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessionData.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {groupBy === 'campaign' ? (row.utm_campaign || '(no campaign)') :
                       groupBy === 'source' ? (row.utm_source || '(no source)') :
                       groupBy === 'device' ? (row.device_category || '(unknown)') :
                       (row.entry_lp_slug || '(no LP)')}
                    </td>
                    {groupBy === 'campaign' && (
                      <td className="px-4 py-3 text-gray-600">
                        {row.utm_source || '-'} / {row.utm_medium || '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">{row.session_count}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {totalSessions > 0 ? ((row.session_count / totalSessions) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
