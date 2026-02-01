'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/emails', label: 'Email list' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/shipping', label: 'Shipping' },
  { href: '/admin/couriers', label: 'Couriers' },
  { href: '/admin/analytics/ga4', label: 'Analytics / GA4' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/logs', label: 'Logs' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {navItems.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded transition-colors ${
              active
                ? 'bg-blue-600 text-white font-medium'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
