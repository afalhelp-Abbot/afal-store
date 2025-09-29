"use client";

import { PropsWithChildren, useId, useState } from "react";

export default function HelpTip({ children }: PropsWithChildren<{}>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <button
        aria-describedby={open ? id : undefined}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-xs hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Help"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="z-10 max-w-xs ml-2 px-3 py-2 rounded bg-black text-white text-xs shadow"
        >
          {children}
        </span>
      )}
    </span>
  );
}
