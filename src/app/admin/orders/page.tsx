import { requireAdmin } from '@/lib/auth';

export default async function OrdersPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <div className="border rounded p-4">
        <h2 className="font-medium">Orders Capabilities (This Page)</h2>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1 text-gray-700">
          <li>View all orders with filters (status, date, search). [Planned]</li>
          <li>Open an order to review items, totals, and customer details. [Planned]</li>
          <li>Advance order status: <span className="font-medium">pending → packed → shipped</span>. [Planned]</li>
          <li>Verify COD and mark as confirmed/failed. [Planned]</li>
          <li>Generate and print a <span className="font-medium">Packing Slip</span>. [Planned]</li>
        </ul>
      </div>
    </div>
  );
}
