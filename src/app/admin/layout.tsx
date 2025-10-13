import Link from 'next/link';
import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-12">
      <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-r p-4 space-y-3">
        <h1 className="text-lg font-semibold">Afal Admin</h1>
        <nav className="flex flex-col gap-2 text-sm">
          <Link className="hover:underline" href="/admin">Dashboard</Link>
          <Link className="hover:underline" href="/admin/inventory">Inventory</Link>
          <Link className="hover:underline" href="/admin/orders">Orders</Link>
          <Link className="hover:underline" href="/admin/shipping">Shipping</Link>
          <Link className="hover:underline" href="/admin/products">Products</Link>
        </nav>
      </aside>
      <main className="col-span-12 md:col-span-9 lg:col-span-10 p-6">
        {children}
      </main>
    </div>
  );
}
