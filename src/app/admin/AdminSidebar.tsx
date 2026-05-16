'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

const navItems = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/emails', label: 'Email list' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/shipping', label: 'Shipping' },
  { href: '/admin/couriers', label: 'Couriers' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/advertising', label: 'Advertising' },
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

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.replace('/admin/login');
  };

  return (
    <nav className="flex flex-col gap-1 text-sm h-full">
      <div className="flex-1 flex flex-col gap-1">
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
      </div>
      
      <div className="pt-4 mt-4 border-t">
        <button
          onClick={handleLogout}
          className="w-full px-3 py-2 rounded text-left text-red-600 hover:bg-red-50 transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
