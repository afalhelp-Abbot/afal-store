import Link from 'next/link';
import { ReactNode } from 'react';
import { AdminSidebar } from './AdminSidebar';

export const metadata = {
  robots: { index: false, follow: false },
} as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-12">
      <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-r p-4 flex flex-col min-h-screen">
        <Link href="/admin" className="text-lg font-semibold hover:text-blue-600 mb-3">Afal Admin</Link>
        <div className="flex-1">
          <AdminSidebar />
        </div>
      </aside>
      <main className="col-span-12 md:col-span-9 lg:col-span-10 p-6">
        {children}
      </main>
    </div>
  );
}
