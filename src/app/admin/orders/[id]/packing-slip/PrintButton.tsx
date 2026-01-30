'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-black text-white rounded px-4 py-2"
    >
      Print
    </button>
  );
}
