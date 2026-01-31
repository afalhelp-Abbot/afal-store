'use client';

import { useState, useTransition } from 'react';
import { editOrderAction, getAvailableVariantsAction, EditOrderInput } from './editOrderActions';

type OrderLine = {
  id: string;
  variantId: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

type OrderData = {
  id: string;
  status: string;
  editVersion: number; // For concurrency check
  customerName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: string;
  city: string;
  notes?: string;
  discountTotal: number;
  shippingAmount: number;
  courierTrackingNumber?: string;
  courierBookedAt?: string;
  lines: OrderLine[];
};

type Props = {
  order: OrderData;
  onSaved?: () => void;
};

type AvailableVariant = {
  id: string;
  sku: string;
  price: number;
  stock: number;
  productName: string;
};

export function EditOrderClient({ order, onSaved }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.phone);
  const [alternatePhone, setAlternatePhone] = useState(order.alternatePhone || '');
  const [email, setEmail] = useState(order.email || '');
  const [address, setAddress] = useState(order.address);
  const [city, setCity] = useState(order.city);
  const [notes, setNotes] = useState(order.notes || '');
  const [discountTotal, setDiscountTotal] = useState(order.discountTotal);
  const [shippingAmount, setShippingAmount] = useState(order.shippingAmount);
  const [lines, setLines] = useState<OrderLine[]>(order.lines);
  const [reason, setReason] = useState('');

  // Add SKU state
  const [showAddSku, setShowAddSku] = useState(false);
  const [skuSearch, setSkuSearch] = useState('');
  const [availableVariants, setAvailableVariants] = useState<AvailableVariant[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const isEditable = ['pending', 'packed'].includes(order.status);
  const cnBooked = !!(order.courierTrackingNumber && order.courierTrackingNumber.trim() !== '');

  // Calculate totals
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const total = subtotal + shippingAmount - discountTotal;

  // Original totals for comparison
  const originalSubtotal = order.lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const originalTotal = originalSubtotal + order.shippingAmount - order.discountTotal;

  const hasChanges = 
    customerName !== order.customerName ||
    phone !== order.phone ||
    alternatePhone !== (order.alternatePhone || '') ||
    email !== (order.email || '') ||
    address !== order.address ||
    city !== order.city ||
    notes !== (order.notes || '') ||
    discountTotal !== order.discountTotal ||
    shippingAmount !== order.shippingAmount ||
    JSON.stringify(lines) !== JSON.stringify(order.lines);

  function resetForm() {
    setCustomerName(order.customerName);
    setPhone(order.phone);
    setAlternatePhone(order.alternatePhone || '');
    setEmail(order.email || '');
    setAddress(order.address);
    setCity(order.city);
    setNotes(order.notes || '');
    setDiscountTotal(order.discountTotal);
    setShippingAmount(order.shippingAmount);
    setLines(order.lines);
    setReason('');
    setError(null);
    setSuccess(false);
  }

  function handleCancelEdit() {
    resetForm();
    setEditMode(false);
  }

  function updateLineQty(lineId: string, delta: number) {
    setLines(prev => prev.map(l => {
      if (l.id === lineId) {
        const newQty = Math.max(1, l.qty + delta);
        return { ...l, qty: newQty, lineTotal: newQty * l.unitPrice };
      }
      return l;
    }));
  }

  function updateLinePrice(lineId: string, newPrice: number) {
    setLines(prev => prev.map(l => {
      if (l.id === lineId) {
        const price = Math.max(0, newPrice);
        return { ...l, unitPrice: price, lineTotal: l.qty * price };
      }
      return l;
    }));
  }

  function removeLine(lineId: string) {
    if (lines.length <= 1) {
      setError('Cannot remove the last item. Cancel the order instead.');
      return;
    }
    setLines(prev => prev.filter(l => l.id !== lineId));
  }

  async function searchVariants() {
    setLoadingVariants(true);
    const result = await getAvailableVariantsAction(skuSearch);
    setAvailableVariants(result.variants);
    setLoadingVariants(false);
  }

  function addVariant(variant: AvailableVariant) {
    // Check if already in order
    if (lines.some(l => l.variantId === variant.id)) {
      setError('This SKU is already in the order. Update the quantity instead.');
      return;
    }

    const newLine: OrderLine = {
      id: `new-${Date.now()}`, // Temporary ID for new lines
      variantId: variant.id,
      sku: variant.sku,
      qty: 1,
      unitPrice: variant.price,
      lineTotal: variant.price,
    };
    setLines(prev => [...prev, newLine]);
    setShowAddSku(false);
    setSkuSearch('');
    setAvailableVariants([]);
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);

    if (!reason.trim()) {
      setError('Please provide a reason for the edit');
      return;
    }

    const input: EditOrderInput = {
      orderId: order.id,
      expectedEditVersion: order.editVersion,
      customerName,
      phone,
      alternatePhone: alternatePhone || undefined,
      email: email || undefined,
      address,
      city,
      notes: notes || undefined,
      discountTotal: cnBooked ? order.discountTotal : discountTotal, // Don't send if CN locked
      shippingAmount: cnBooked ? order.shippingAmount : shippingAmount, // Don't send if CN locked
      lines: cnBooked ? undefined : lines.map(l => ({ // Don't send lines if CN locked
        id: l.id.startsWith('new-') ? undefined : l.id,
        variantId: l.variantId,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
      reason,
      // Actor metadata for multi-country tracking
      actorTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    startTransition(async () => {
      const result = await editOrderAction(input);
      if (result.success) {
        setSuccess(true);
        setEditMode(false);
        onSaved?.();
        // Reload page to show updated data
        window.location.reload();
      } else {
        setError(result.error || 'Failed to save changes');
      }
    });
  }

  if (!isEditable) {
    return (
      <div className="text-sm text-gray-500 italic">
        Order cannot be edited (status: {order.status})
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Edit Mode Toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={editMode}
            onChange={(e) => {
              if (e.target.checked) {
                setEditMode(true);
              } else {
                handleCancelEdit();
              }
            }}
            className="rounded"
          />
          <span className="font-medium">Edit Order</span>
        </label>
        {cnBooked && editMode && (
          <div className="text-orange-600 text-sm bg-orange-50 border border-orange-200 rounded px-2 py-1">
            ⚠️ CN already booked — only contact/address/notes can be edited. Line items and totals are locked.
          </div>
        )}
      </div>

      {editMode && (
        <div className="border rounded p-4 space-y-4 bg-gray-50">
          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Customer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alternate Phone</label>
              <input
                type="text"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                placeholder="Optional"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Address *</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                rows={2}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City *</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes (Internal)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded px-3 py-2 w-full"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Order Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">
                Order Items {cnBooked && <span className="text-orange-500 font-normal">(locked)</span>}
              </label>
              {!cnBooked && (
                <button
                  type="button"
                  onClick={() => setShowAddSku(!showAddSku)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  + Add SKU
                </button>
              )}
            </div>

            {showAddSku && (
              <div className="border rounded p-3 mb-3 bg-white">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    placeholder="Search SKU..."
                    className="border rounded px-3 py-1 flex-1"
                  />
                  <button
                    type="button"
                    onClick={searchVariants}
                    disabled={loadingVariants}
                    className="bg-gray-200 hover:bg-gray-300 rounded px-3 py-1 text-sm"
                  >
                    {loadingVariants ? 'Loading...' : 'Search'}
                  </button>
                </div>
                {availableVariants.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border rounded">
                    {availableVariants.map(v => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        onClick={() => addVariant(v)}
                      >
                        <div>
                          <span className="font-medium">{v.sku}</span>
                          <span className="text-gray-500 text-sm ml-2">{v.productName}</span>
                        </div>
                        <div className="text-sm">
                          <span>{v.price.toLocaleString()} PKR</span>
                          <span className="text-gray-500 ml-2">(Stock: {v.stock})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <table className="w-full text-sm border rounded">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-center px-3 py-2 w-32">Qty</th>
                  <th className="text-right px-3 py-2">Unit Price</th>
                  <th className="text-right px-3 py-2">Line Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-2">{line.sku}</td>
                    <td className="px-3 py-2">
                      {cnBooked ? (
                        <span className="text-center block">{line.qty}</span>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateLineQty(line.id, -1)}
                            className="w-7 h-7 rounded bg-gray-200 hover:bg-gray-300 font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center">{line.qty}</span>
                          <button
                            type="button"
                            onClick={() => updateLineQty(line.id, 1)}
                            className="w-7 h-7 rounded bg-gray-200 hover:bg-gray-300 font-bold"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {cnBooked ? (
                        <span>{line.unitPrice.toLocaleString()} PKR</span>
                      ) : (
                        <input
                          type="number"
                          value={line.unitPrice}
                          onChange={(e) => updateLinePrice(line.id, Number(e.target.value) || 0)}
                          className="border rounded px-2 py-1 w-24 text-right"
                          min="0"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{line.lineTotal.toLocaleString()} PKR</td>
                    <td className="px-3 py-2">
                      {!cnBooked && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-red-500 hover:text-red-700"
                          title="Remove"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Shipping & Discount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Shipping (PKR) {cnBooked && <span className="text-orange-500 font-normal">(locked)</span>}
              </label>
              <input
                type="number"
                value={shippingAmount}
                onChange={(e) => setShippingAmount(Number(e.target.value) || 0)}
                className="border rounded px-3 py-2 w-full"
                min="0"
                disabled={cnBooked}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Discount (PKR) {cnBooked && <span className="text-orange-500 font-normal">(locked)</span>}
              </label>
              <input
                type="number"
                value={discountTotal}
                onChange={(e) => setDiscountTotal(Number(e.target.value) || 0)}
                className="border rounded px-3 py-2 w-full"
                min="0"
                disabled={cnBooked}
              />
            </div>
          </div>

          {/* Preview Panel */}
          {hasChanges && (
            <div className="border rounded p-3 bg-blue-50">
              <h4 className="font-medium mb-2">Preview Changes</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Original Total</div>
                  <div className="font-medium">{originalTotal.toLocaleString()} PKR</div>
                </div>
                <div>
                  <div className="text-gray-600">New Total</div>
                  <div className="font-medium text-blue-600">{total.toLocaleString()} PKR</div>
                </div>
              </div>
              {total !== originalTotal && (
                <div className="mt-2 text-sm">
                  Difference: <span className={total > originalTotal ? 'text-green-600' : 'text-red-600'}>
                    {total > originalTotal ? '+' : ''}{(total - originalTotal).toLocaleString()} PKR
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium mb-1">Reason for Edit *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              rows={2}
              placeholder="e.g., Customer requested quantity change"
              required
            />
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
              Order updated successfully!
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !hasChanges}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={isPending}
              className="bg-gray-200 hover:bg-gray-300 rounded px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
