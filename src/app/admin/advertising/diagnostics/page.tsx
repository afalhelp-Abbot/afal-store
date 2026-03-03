'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

type PixelConfig = {
  product_id: string;
  product_name: string;
  product_slug: string;
  enabled: boolean;
  pixel_id: string | null;
  content_id_source: string;
  events: {
    view_content?: boolean;
    initiate_checkout?: boolean;
    add_payment_info?: boolean;
    purchase?: boolean;
  };
};

type RecentEvent = {
  id: string;
  event_type: string;
  event_id: string;
  created_at: string;
  pixel_loaded: boolean | null;
  pixel_blocked_suspected: boolean | null;
  pixel_error_code: string | null;
  session_lp_slug: string | null;
  order_id: string | null;
};

type Warning = {
  type: 'error' | 'warning' | 'info';
  message: string;
  product?: string;
};

export default function DiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [pixelConfigs, setPixelConfigs] = useState<PixelConfig[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  
  // Health KPIs
  const [healthKpis, setHealthKpis] = useState({
    eventsLast24h: 0,
    pixelLoadedFalseRate: 0,
    blockedSuspectedRate: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch pixel configs with product info
      const { data: configs, error: configsError } = await supabaseBrowser
        .from('product_pixel')
        .select(`
          product_id,
          enabled,
          pixel_id,
          content_id_source,
          events,
          product:products!inner(name, slug)
        `);

      if (configsError) throw configsError;

      const pixelData: PixelConfig[] = (configs || []).map((c: any) => ({
        product_id: c.product_id,
        product_name: c.product?.name || '(unknown)',
        product_slug: c.product?.slug || '',
        enabled: c.enabled,
        pixel_id: c.pixel_id,
        content_id_source: c.content_id_source || 'sku',
        events: c.events || {},
      }));

      setPixelConfigs(pixelData);

      // Fetch recent events (last 50)
      const { data: events, error: eventsError } = await supabaseBrowser
        .from('lp_events')
        .select(`
          id,
          event_type,
          event_id,
          created_at,
          pixel_loaded,
          pixel_blocked_suspected,
          pixel_error_code,
          order_id,
          session:sessions(entry_lp_slug)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) throw eventsError;

      const eventData: RecentEvent[] = (events || []).map((e: any) => ({
        id: e.id,
        event_type: e.event_type,
        event_id: e.event_id,
        created_at: e.created_at,
        pixel_loaded: e.pixel_loaded,
        pixel_blocked_suspected: e.pixel_blocked_suspected,
        pixel_error_code: e.pixel_error_code,
        session_lp_slug: e.session?.entry_lp_slug || null,
        order_id: e.order_id,
      }));

      setRecentEvents(eventData);

      // Generate warnings
      const warningsList: Warning[] = [];

      // Check for enabled pixels without pixel_id
      for (const config of pixelData) {
        if (config.enabled && !config.pixel_id) {
          warningsList.push({
            type: 'error',
            message: `Pixel enabled but no Pixel ID configured`,
            product: config.product_name,
          });
        }
      }

      // Check for purchase events without order_id
      const purchaseWithoutOrder = eventData.filter(
        (e) => e.event_type === 'purchase' && !e.order_id
      );
      if (purchaseWithoutOrder.length > 0) {
        warningsList.push({
          type: 'warning',
          message: `${purchaseWithoutOrder.length} purchase event(s) without order_id`,
        });
      }

      // Check for blocked pixels
      const blockedEvents = eventData.filter((e) => e.pixel_blocked_suspected);
      if (blockedEvents.length > 0) {
        warningsList.push({
          type: 'warning',
          message: `${blockedEvents.length} event(s) with suspected pixel blocking`,
        });
      }

      // Check for no events in last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const eventsLast24h = eventData.filter(
        (e) => new Date(e.created_at) > oneDayAgo
      );
      if (eventsLast24h.length === 0 && eventData.length > 0) {
        warningsList.push({
          type: 'info',
          message: 'No events in the last 24 hours',
        });
      }

      // Calculate health KPIs
      const pixelLoadedFalse = eventData.filter((e) => e.pixel_loaded === false).length;
      const blockedSuspected = eventData.filter((e) => e.pixel_blocked_suspected === true).length;
      
      setHealthKpis({
        eventsLast24h: eventsLast24h.length,
        pixelLoadedFalseRate: eventData.length > 0 ? (pixelLoadedFalse / eventData.length) * 100 : 0,
        blockedSuspectedRate: eventData.length > 0 ? (blockedSuspected / eventData.length) * 100 : 0,
      });

      setWarnings(warningsList);
    } catch (e: any) {
      setError(e?.message || 'Failed to load diagnostics data');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString();
  };

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case 'view_content':
        return 'bg-blue-100 text-blue-800';
      case 'initiate_checkout':
        return 'bg-yellow-100 text-yellow-800';
      case 'purchase':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getWarningIcon = (type: Warning['type']) => {
    switch (type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
    }
  };

  const getWarningColor = (type: Warning['type']) => {
    switch (type) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Meta Diagnostics</h1>
          <p className="text-sm text-gray-600">Pixel status, recent events, and tracking health</p>
        </div>
        <Link href="/admin/advertising" className="text-sm text-blue-600 hover:underline">
          ← Back to Advertising
        </Link>
      </div>

      {/* Collapsible Help Box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-purple-100 transition-colors rounded-lg"
        >
          <div>
            <span className="font-medium text-purple-900">📖 What to check here</span>
            <span className="text-purple-700 text-sm ml-2">/ یہاں کیا چیک کریں</span>
          </div>
          <span className="text-purple-600">{showHelp ? '▲ Hide' : '▼ Show'}</span>
        </button>
        
        {showHelp && (
          <div className="px-5 pb-5 border-t border-purple-200">
            <div className="grid md:grid-cols-2 gap-6 pt-4">
              {/* English */}
              <div className="space-y-3">
                <h4 className="font-semibold text-purple-900 text-sm">English</h4>
                <div>
                  <p className="text-sm font-medium text-purple-800">Pixel Configuration</p>
                  <p className="text-xs text-purple-700">Enabled + Pixel ID present = good</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-800">Recent Events</p>
                  <p className="text-xs text-purple-700">If events appear, tracking is firing</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-800">Common issues</p>
                  <p className="text-xs text-purple-700">"No Pixel ID" → Products → Edit → Meta Pixel</p>
                  <p className="text-xs text-purple-700">"Blocked suspected" → ad blockers/privacy</p>
                </div>
              </div>
              {/* Urdu */}
              <div className="space-y-3">
                <h4 className="font-semibold text-purple-900 text-sm">اردو</h4>
                <div>
                  <p className="text-sm font-medium text-purple-800">پکسل سیٹنگ</p>
                  <p className="text-xs text-purple-700">Enabled اور Pixel ID موجود = ٹھیک ہے</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-800">حالیہ ایونٹس</p>
                  <p className="text-xs text-purple-700">ایونٹس آ رہے ہیں تو ٹریکنگ چل رہی ہے</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-800">مسائل</p>
                  <p className="text-xs text-purple-700">"No Pixel ID" → Products → Edit میں سیٹ کریں</p>
                  <p className="text-xs text-purple-700">"Blocked" → ایڈ بلاکر/پرائیویسی</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Health KPIs */}
      {!loading && recentEvents.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{healthKpis.eventsLast24h}</div>
            <div className="text-xs text-gray-600">Events (24h)</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${healthKpis.pixelLoadedFalseRate > 20 ? 'text-red-600' : 'text-green-600'}`}>
              {healthKpis.pixelLoadedFalseRate.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600">Pixel Load Failed</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${healthKpis.blockedSuspectedRate > 20 ? 'text-amber-600' : 'text-green-600'}`}>
              {healthKpis.blockedSuspectedRate.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600">Blocked Suspected</div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Warnings</h3>
              {warnings.map((w, i) => (
                <div
                  key={i}
                  className={`border rounded p-3 text-sm flex items-start gap-2 ${getWarningColor(w.type)}`}
                >
                  <span>{getWarningIcon(w.type)}</span>
                  <div>
                    {w.product && <span className="font-medium">{w.product}: </span>}
                    {w.message}
                  </div>
                </div>
              ))}
            </div>
          )}

          {warnings.length === 0 && (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
              ✅ No issues detected. Pixel tracking appears healthy.
            </div>
          )}

          {/* Pixel Configurations */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b font-medium">
              Pixel Configurations by Product
            </div>
            {pixelConfigs.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No pixel configurations found. Configure pixels in Products → Edit → Meta Pixel.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Product</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Pixel ID</th>
                    <th className="text-left px-4 py-3 font-medium">Content ID</th>
                    <th className="text-left px-4 py-3 font-medium">Events Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pixelConfigs.map((config) => (
                    <tr key={config.product_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{config.product_name}</div>
                        <div className="text-xs text-gray-500">/lp/{config.product_slug}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {config.enabled ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {config.pixel_id || <span className="text-red-500">Not set</span>}
                      </td>
                      <td className="px-4 py-3">{config.content_id_source.toUpperCase()}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {config.events.view_content && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">ViewContent</span>
                          )}
                          {config.events.initiate_checkout && (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">InitiateCheckout</span>
                          )}
                          {config.events.purchase && (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Purchase</span>
                          )}
                          {!config.events.view_content && !config.events.initiate_checkout && !config.events.purchase && (
                            <span className="text-gray-400 text-xs">None</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Events */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b font-medium flex items-center justify-between">
              <span>Recent Events (Last 50)</span>
              <button
                onClick={loadData}
                className="text-sm text-blue-600 hover:underline"
              >
                Refresh
              </button>
            </div>
            {recentEvents.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No events recorded yet. Events will appear once users visit LPs.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Time</th>
                      <th className="text-left px-4 py-2 font-medium">Event</th>
                      <th className="text-left px-4 py-2 font-medium">LP</th>
                      <th className="text-center px-4 py-2 font-medium">Pixel Status</th>
                      <th className="text-left px-4 py-2 font-medium">Event ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                          {formatTime(event.created_at)}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getEventBadgeColor(event.event_type)}`}>
                            {event.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {event.session_lp_slug ? `/lp/${event.session_lp_slug}` : '-'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {event.pixel_blocked_suspected ? (
                            <span className="text-red-500" title="Pixel may be blocked">⚠️</span>
                          ) : event.pixel_loaded === true ? (
                            <span className="text-green-500" title="Pixel loaded">✓</span>
                          ) : event.pixel_loaded === false ? (
                            <span className="text-red-500" title="Pixel failed">✗</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500 truncate max-w-[200px]" title={event.event_id}>
                          {event.event_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
