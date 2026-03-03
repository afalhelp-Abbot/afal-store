'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const subNavItems = [
  { href: '/admin/advertising', label: 'Overview', exact: true },
  { href: '/admin/advertising/attribution', label: 'Attribution' },
  { href: '/admin/advertising/funnel', label: 'Funnel' },
  { href: '/admin/advertising/diagnostics', label: 'Meta Diagnostics' },
];

export default function AdvertisingPage() {
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Advertising</h1>
      </div>

      {/* Collapsible Help Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-100 transition-colors rounded-lg"
        >
          <div>
            <span className="font-medium text-blue-900">📖 What is this section?</span>
            <span className="text-blue-700 text-sm ml-2">/ یہ سیکشن کیا ہے؟</span>
          </div>
          <span className="text-blue-600">{showHelp ? '▲ Hide' : '▼ Show'}</span>
        </button>
        
        {showHelp && (
          <div className="px-5 pb-5 space-y-3 border-t border-blue-200">
            <div className="pt-4">
              <p className="text-sm text-blue-800">Track Meta (Facebook) ad performance using first-party data from your store.</p>
              <p className="text-sm text-blue-700 mt-1">اپنے اسٹور کے ڈیٹا سے میٹا اشتہارات کی کارکردگی دیکھیں۔</p>
            </div>
            <div>
              <p className="text-sm text-blue-800">See which campaigns bring orders, where customers drop off, and if tracking works.</p>
              <p className="text-sm text-blue-700 mt-1">دیکھیں کون سی مہم آرڈر لاتی ہے، گاہک کہاں رکتے ہیں۔</p>
            </div>
          </div>
        )}
      </div>

      {/* Tracking rollout date note */}
      <div className="bg-gray-100 border border-gray-200 rounded px-4 py-2 text-sm text-gray-700">
        📅 <strong>Tracking rollout date:</strong> March 3, 2026. Session and event data before this date will be incomplete or missing.
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b pb-2">
        {subNavItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Overview content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/advertising/attribution"
          className="p-6 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
        >
          <h2 className="text-lg font-semibold mb-2">Attribution</h2>
          <p className="text-sm text-gray-600">
            See which campaigns, devices, and LPs are driving orders and revenue.
          </p>
        </Link>

        <Link
          href="/admin/advertising/funnel"
          className="p-6 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
        >
          <h2 className="text-lg font-semibold mb-2">Funnel</h2>
          <p className="text-sm text-gray-600">
            Track conversion rates from LP view → checkout → purchase.
          </p>
        </Link>

        <Link
          href="/admin/advertising/diagnostics"
          className="p-6 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
        >
          <h2 className="text-lg font-semibold mb-2">Meta Diagnostics</h2>
          <p className="text-sm text-gray-600">
            Check pixel status, recent events, and tracking health.
          </p>
        </Link>
      </div>

      {/* Quick stats placeholder */}
      <div className="bg-gray-50 border rounded-lg p-6">
        <h3 className="font-medium mb-4">Quick Stats (Last 7 Days)</h3>
        <p className="text-sm text-gray-500">
          Stats will appear here once session data is collected.
        </p>
      </div>
    </div>
  );
}
