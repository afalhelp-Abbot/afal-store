'use client';

import { useState } from 'react';
import Link from 'next/link';

type LogEntry = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  entity_code: string;
  summary: string;
  metadata: any;
  actor_id: string | null;
  actor_email: string | null;
  actor_timezone: string | null;
  ip_country: string | null;
  created_at: string;
};

type Props = {
  logs: LogEntry[];
};

const eventTypeColors: Record<string, string> = {
  order_edit: 'bg-blue-100 text-blue-800',
  inventory_change: 'bg-green-100 text-green-800',
  product_edit: 'bg-purple-100 text-purple-800',
  courier_status: 'bg-orange-100 text-orange-800',
};

const eventTypeLabels: Record<string, string> = {
  order_edit: 'Order Edit',
  inventory_change: 'Inventory',
  product_edit: 'Product Edit',
  courier_status: 'Courier',
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCountryFlag(country: string | null): string {
  if (!country) return '';
  const flags: Record<string, string> = {
    'PK': '🇵🇰',
    'CA': '🇨🇦',
    'US': '🇺🇸',
    'GB': '🇬🇧',
    'AE': '🇦🇪',
  };
  return flags[country.toUpperCase()] || country;
}

function getTimezoneShort(tz: string | null): string {
  if (!tz) return '';
  if (tz.includes('Karachi')) return 'PKT';
  if (tz.includes('Toronto') || tz.includes('New_York')) return 'EST';
  if (tz.includes('Vancouver') || tz.includes('Los_Angeles')) return 'PST';
  return tz.split('/').pop() || tz;
}

function getEntityLink(log: LogEntry): string | null {
  if (log.entity_type === 'order' && log.entity_id) {
    return `/admin/orders/${log.entity_id}`;
  }
  if (log.entity_type === 'product' && log.entity_id) {
    return `/admin/products/${log.entity_id}`;
  }
  if (log.entity_type === 'inventory' && log.entity_id) {
    return `/admin/inventory`;
  }
  return null;
}

export function LogsClient({ logs }: Props) {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  return (
    <>
      {/* Logs Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Time</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">What Happened</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Who</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No logs found
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const entityLink = getEntityLink(log);
                return (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      <div>{formatDate(log.created_at)}</div>
                      {log.actor_timezone && (
                        <div className="text-xs text-gray-400">
                          {getTimezoneShort(log.actor_timezone)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                          eventTypeColors[log.event_type] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {eventTypeLabels[log.event_type] || log.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{log.summary}</div>
                      {log.entity_code && (
                        <div className="text-xs text-gray-500 mt-1">
                          {log.entity_type}: {log.entity_code}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        {log.ip_country && (
                          <span title={log.ip_country} className="text-base">
                            {getCountryFlag(log.ip_country)}
                          </span>
                        )}
                        <span>{log.actor_email || <span className="text-gray-400">—</span>}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View Details
                        </button>
                        {entityLink && (
                          <Link
                            href={entityLink}
                            className="text-gray-600 hover:text-gray-800 text-sm"
                          >
                            Go to {log.entity_type}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Log Details</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-sm text-gray-500">Event Type</div>
                  <div className="font-medium">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        eventTypeColors[selectedLog.event_type] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {eventTypeLabels[selectedLog.event_type] || selectedLog.event_type}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Time</div>
                  <div className="font-medium">{formatDate(selectedLog.created_at)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Entity</div>
                  <div className="font-medium">
                    {selectedLog.entity_type}: {selectedLog.entity_code || selectedLog.entity_id}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Actor</div>
                  <div className="font-medium flex items-center gap-2">
                    {selectedLog.ip_country && (
                      <span title={selectedLog.ip_country}>{getCountryFlag(selectedLog.ip_country)}</span>
                    )}
                    {selectedLog.actor_email || '—'}
                  </div>
                </div>
                {selectedLog.actor_timezone && (
                  <div>
                    <div className="text-sm text-gray-500">Timezone</div>
                    <div className="font-medium">{selectedLog.actor_timezone}</div>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <div className="text-sm text-gray-500 mb-1">Summary</div>
                <div className="bg-gray-50 rounded p-3">{selectedLog.summary}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">Metadata / Diff</div>
                <pre className="bg-gray-900 text-green-400 rounded p-4 text-sm overflow-x-auto">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
