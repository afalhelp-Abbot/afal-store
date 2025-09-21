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
      <div className="border rounded p-4">
        <h2 className="font-medium">Admin Capabilities (This Page)</h2>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-gray-700">
          <li>Navigate to core admin sections using the Quick Links.</li>
          <li>Review your signed-in account and verify admin access.</li>
          <li>Access Inventory to edit variant <span className="font-medium">Price</span> and <span className="font-medium">On Hand</span>, or use <span className="font-medium">Quick Adjust</span>.</li>
          <li>Open Orders to process statuses (pending → packed → shipped) and print packing slips. (Coming next)</li>
          <li>Manage Products and Variants configuration.</li>
        </ul>
      </div>
    </div>
  );
}
