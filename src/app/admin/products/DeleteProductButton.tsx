'use client';

import { useState } from 'react';
import { deleteProductAction } from './deleteAction';

type Props = {
  productId: string;
  productName: string;
  productSlug: string;
};

export function DeleteProductButton({ productId, productName, productSlug }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === productSlug;

  const handleDelete = async () => {
    if (!canDelete) return;
    
    setLoading(true);
    setError(null);
    
    const result = await deleteProductAction(productId);
    
    if (result.success) {
      setShowModal(false);
      // Page will revalidate automatically
    } else {
      setError(result.error || 'Failed to delete product');
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-red-600 hover:underline"
      >
        Delete
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-600">Delete Product</h2>
            
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">
                You are about to delete <strong>{productName}</strong>.
              </p>
              <p className="text-gray-700">
                This will also delete all variants, landing pages, and pixel settings for this product.
              </p>
              <p className="text-red-600 font-medium">
                This action cannot be undone.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-gray-700">
                Type <strong className="font-mono bg-gray-100 px-1 rounded">{productSlug}</strong> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={productSlug}
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowModal(false);
                  setConfirmText('');
                  setError(null);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete || loading}
                className={`px-4 py-2 text-sm rounded text-white ${
                  canDelete && !loading
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {loading ? 'Deleting...' : 'Delete Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
