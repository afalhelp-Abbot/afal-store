'use client';

import { useState, useRef, useEffect } from 'react';

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'return_in_transit', label: 'Return in transit' },
  { value: 'returned', label: 'Returned' },
];

type Props = {
  currentStatuses: string[];
};

export function StatusFilterDropdown({ currentStatuses }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentStatuses);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSelected = selected.length === 0 || selected.length === STATUSES.length;

  function handleAllChange() {
    if (isAllSelected) {
      // If all selected, keep all (no change needed, or could clear)
      setSelected([]);
    } else {
      // Select all
      setSelected([]);
    }
  }

  function handleStatusChange(value: string) {
    if (selected.includes(value)) {
      setSelected(selected.filter((s) => s !== value));
    } else {
      setSelected([...selected, value]);
    }
  }

  // Display text for the dropdown button
  const displayText = isAllSelected
    ? 'All'
    : selected.length === 1
    ? STATUSES.find((s) => s.value === selected[0])?.label || selected[0]
    : `${selected.length} selected`;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Hidden inputs for form submission */}
      {selected.length > 0 ? (
        selected.map((s) => (
          <input key={s} type="hidden" name="status" value={s} />
        ))
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="border rounded px-3 py-2 bg-white min-w-[140px] text-left flex items-center justify-between gap-2"
      >
        <span>{displayText}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded shadow-lg z-50 min-w-[180px]">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleAllChange}
              className="rounded"
            />
            <span className="font-medium">All</span>
          </label>
          {STATUSES.map((s) => (
            <label
              key={s.value}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isAllSelected || selected.includes(s.value)}
                onChange={() => handleStatusChange(s.value)}
                className="rounded"
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
