import { requireAdmin } from '@/lib/auth';

export default async function AdminDashboardPage() {
  const { profile } = await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-gray-600">Signed in as {profile?.email}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-4">
          <h2 className="font-medium">Quick Links</h2>
          <ul className="list-disc pl-5 text-sm mt-2">
            <li><a className="underline" href="/admin/inventory">Manage Inventory</a></li>
            <li><a className="underline" href="/admin/orders">View Orders</a></li>
            <li><a className="underline" href="/admin/products">Products</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
