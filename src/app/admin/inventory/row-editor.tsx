'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type RowEditorProps = {
  sku: string;
  product: string;
  initialPrice: number;
  initialOnHand: number;
  reserved: number;
  available: number;
  updatePrice: (formData: FormData) => Promise<void> | void;
  setStock: (formData: FormData) => Promise<void> | void;
};

export default function RowEditor(props: RowEditorProps) {
  const router = useRouter();
  const { sku, product, initialPrice, initialOnHand, reserved, available, updatePrice, setStock } = props;
  const [price, setPrice] = useState<number>(initialPrice);
  const [onHand, setOnHand] = useState<number>(initialOnHand);
  // Local baselines so dirty state resets after save without waiting on server props
  const [priceBase, setPriceBase] = useState<number>(initialPrice);
  const [onHandBase, setOnHandBase] = useState<number>(initialOnHand);
  const priceDirty = useMemo(() => Number(price) !== Number(priceBase), [price, priceBase]);
  const stockDirty = useMemo(() => Number(onHand) !== Number(onHandBase), [onHand, onHandBase]);
  const dirty = priceDirty || stockDirty;

  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // Warn on page unload if there are unsaved edits
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    if (dirty) window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2 pr-4">{product}</td>
      <td className="py-2 pr-4 font-mono">{sku}</td>
      <td className="py-2 pr-4">
        <form
          action={async (fd: FormData) => {
            try {
              await updatePrice(fd);
              setPriceBase(Number(price));
              setToast({ kind: 'success', msg: 'Price saved' });
              router.refresh();
            } catch (e: any) {
              setToast({ kind: 'error', msg: e?.message || 'Failed to save price' });
            }
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="sku" value={sku} />
          <input
            name="price"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="border rounded px-2 py-1 w-32"
          />
          <button
            type="submit"
            disabled={!priceDirty}
            className={`rounded px-3 py-1 text-sm ${priceDirty ? 'bg-black text-white shadow hover:opacity-90' : 'bg-gray-200 text-gray-600 cursor-not-allowed'}`}
            title={priceDirty ? 'Save new price' : 'No changes'}
          >
            Save
          </button>
        </form>
      </td>
      <td className="py-2 pr-4">
        <form
          action={async (fd: FormData) => {
            try {
              await setStock(fd);
              setOnHandBase(Number(onHand));
              setToast({ kind: 'success', msg: 'Stock saved' });
              router.refresh();
            } catch (e: any) {
              setToast({ kind: 'error', msg: e?.message || 'Failed to save stock' });
            }
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="sku" value={sku} />
          <input
            name="on_hand"
            type="number"
            value={onHand}
            onChange={(e) => setOnHand(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24"
          />
          <button
            type="submit"
            disabled={!stockDirty}
            className={`rounded px-3 py-1 text-sm ${stockDirty ? 'bg-black text-white shadow hover:opacity-90' : 'bg-gray-200 text-gray-600 cursor-not-allowed'}`}
            title={stockDirty ? 'Save new stock' : 'No changes'}
          >
            Save
          </button>
        </form>
      </td>
      <td className="py-2 pr-4">{reserved}</td>
      <td className="py-2 pr-4 font-semibold">{available}</td>
      <td className="py-2 pr-4 whitespace-nowrap">
        {dirty ? (
          <span className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1">Unsaved changes</span>
        ) : (
          <span className="text-xs text-gray-400">No changes</span>
        )}
      </td>
      {toast && (
        <td>
          <div
            className={`fixed bottom-4 right-4 z-50 rounded px-4 py-2 text-sm shadow ${toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
            role="status"
          >
            {toast.msg}
          </div>
        </td>
      )}
    </tr>
  );
}
