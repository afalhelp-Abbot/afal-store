"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rtl?: boolean;
  className?: string;
};

// Minimal, dependency-free toolbar using document.execCommand for common formatting.
// Although execCommand is deprecated, it remains widely supported and is sufficient for admin authoring.
export default function RichTextEditor({ value, onChange, placeholder, rtl, className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Keep contenteditable in sync when external value changes
    if (!ref.current) return;
    if (ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const cmd = (command: string, value?: string) => {
    // focus the editor before issuing command
    ref.current?.focus();
    try {
      document.execCommand(command, false, value);
      // After formatting, propagate new HTML
      const html = ref.current?.innerHTML || "";
      onChange(html);
    } catch {}
  };

  // Apply font-size in pixels by leveraging execCommand('fontSize') and normalizing <font>
  const setFontSizePx = (px: number) => {
    if (!ref.current) return;
    ref.current.focus();
    try {
      // Use size=7 as a marker, then convert to <span style="font-size: ..px">
      document.execCommand('fontSize', false, '7');
      // Replace any <font size="7"> within editor to span with px
      const fonts = Array.from(ref.current.querySelectorAll('font[size="7"]')) as HTMLFontElement[];
      fonts.forEach((fontEl) => {
        const span = document.createElement('span');
        span.style.fontSize = `${px}px`;
        // carry inline color/fontName if any
        const color = fontEl.getAttribute('color');
        if (color) span.style.color = color;
        const face = fontEl.getAttribute('face');
        if (face) span.style.fontFamily = face;
        while (fontEl.firstChild) span.appendChild(fontEl.firstChild);
        fontEl.replaceWith(span);
      });
      normalizeLists();
      const html = ref.current?.innerHTML || '';
      onChange(html);
    } catch {}
  };

  // Remove list structure. If caret is inside a single <li>, unlist just that item.
  // If the selection spans the whole list, unwrap the entire list.
  const unlistSelection = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const findAncestor = (node: Node | null, match: (el: HTMLElement) => boolean): HTMLElement | null => {
      let cur: Node | null = node;
      while (cur && cur !== ref.current) {
        if (cur instanceof HTMLElement && match(cur)) return cur;
        cur = cur.parentNode;
      }
      return null;
    };
    const liEl = findAncestor(range.commonAncestorContainer, (el) => el.tagName === 'LI') as HTMLLIElement | null;
    const listEl = findAncestor(range.commonAncestorContainer, (el) => el.tagName === 'UL' || el.tagName === 'OL');
    if (!listEl) return;

    // If we're inside a specific <li>, unwrap only that <li>
    if (liEl) {
      const after = document.createTextNode('');
      // Extract children from li
      const frag = document.createDocumentFragment();
      while (liEl.firstChild) frag.appendChild(liEl.firstChild);
      // Replace li with its content
      liEl.replaceWith(frag, after);

      // If the list becomes empty, remove it
      if (!listEl.querySelector(':scope > li')) listEl.remove();

      // Restore caret after the unlisted content
      const newRange = document.createRange();
      if (after.parentNode) {
        newRange.setStart(after, 0);
        newRange.setEnd(after, 0);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      normalizeLists();
      const htmlNow = ref.current?.innerHTML || '';
      onChange(htmlNow);
      return;
    }

    // Otherwise, unwrap the whole list into plain lines
    const frag = document.createDocumentFragment();
    const items = Array.from(listEl.querySelectorAll(':scope > li')) as HTMLLIElement[];
    items.forEach((li, idx) => {
      while (li.firstChild) frag.appendChild(li.firstChild);
      if (idx < items.length - 1) frag.appendChild(document.createElement('br'));
    });
    listEl.replaceWith(frag);
    normalizeLists();
    const htmlAll = ref.current?.innerHTML || '';
    onChange(htmlAll);
  };

  // Ensure bullets and numbers are visible even if global CSS resets list styles
  function normalizeLists() {
    if (!ref.current) return;
    const uls = Array.from(ref.current.querySelectorAll('ul')) as HTMLElement[];
    const ols = Array.from(ref.current.querySelectorAll('ol')) as HTMLElement[];
    uls.forEach((el) => {
      el.classList.add('rte-force-ul');
      if (!el.style.listStyleType) el.style.listStyleType = 'disc';
      if (!el.style.marginLeft) el.style.marginLeft = '1.25rem';
      if (!el.style.paddingLeft) el.style.paddingLeft = '0.25rem';
    });
    ols.forEach((el) => {
      el.classList.add('rte-force-ol');
      if (!el.style.listStyleType) el.style.listStyleType = 'decimal';
      if (!el.style.marginLeft) el.style.marginLeft = '1.25rem';
      if (!el.style.paddingLeft) el.style.paddingLeft = '0.25rem';
    });
  }

  // Convert selected multi-line text into a list (<ul>/<ol>), falling back to execCommand
  const makeList = (ordered: boolean) => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      cmd(ordered ? "insertOrderedList" : "insertUnorderedList");
      return;
    }
    const range = sel.getRangeAt(0);
    const text = sel.toString();

    // Case 1: caret only -> insert an empty list and place caret inside first <li>
    if (sel.isCollapsed) {
      const list = document.createElement(ordered ? "ol" : "ul");
      const li = document.createElement("li");
      li.appendChild(document.createElement("br"));
      list.appendChild(li);
      range.insertNode(list);
      normalizeLists();
      // place caret inside the new li
      const newRange = document.createRange();
      newRange.selectNodeContents(li);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      const htmlNow = ref.current?.innerHTML || "";
      onChange(htmlNow);
      return;
    }

    // Case 2: multi-line selection -> create list from lines
    if (text && /\r?\n/.test(text)) {
      const lines = text
        .split(/\r?\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const list = document.createElement(ordered ? "ol" : "ul");
      lines.forEach((l) => {
        const li = document.createElement("li");
        li.textContent = l;
        list.appendChild(li);
      });
      // Replace selection with the list
      range.deleteContents();
      range.insertNode(list);
      normalizeLists();
      // Move caret inside the last li
      const lastLi = list.lastElementChild as HTMLElement | null;
      if (lastLi) {
        const newRange = document.createRange();
        newRange.selectNodeContents(lastLi);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      const htmlNow = ref.current?.innerHTML || "";
      onChange(htmlNow);
      return;
    }

    // Case 3: single-line non-empty selection -> wrap selected content into a single li
    if (text && !/\r?\n/.test(text)) {
      const frag = range.extractContents();
      const list = document.createElement(ordered ? "ol" : "ul");
      const li = document.createElement("li");
      li.appendChild(frag);
      list.appendChild(li);
      range.insertNode(list);
      normalizeLists();
      const newRange = document.createRange();
      newRange.selectNodeContents(li);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
      const htmlNow = ref.current?.innerHTML || "";
      onChange(htmlNow);
      return;
    }

    // Fallback
    cmd(ordered ? "insertOrderedList" : "insertUnorderedList");
  };

  const createLink = () => {
    ref.current?.focus();
    const url = window.prompt("Enter URL (https://...)");
    if (!url) return;
    // Ensure the URL has a protocol
    const safeUrl = /^(https?:)?\/\//i.test(url) ? url : `https://${url}`;
    try {
      document.execCommand("createLink", false, safeUrl);
      const html = ref.current?.innerHTML || "";
      onChange(html);
    } catch {}
  };

  const onInput = () => {
    // Normalize lists to ensure markers are visible even if global CSS resets them
    normalizeLists();
    const html = ref.current?.innerHTML || "";
    onChange(html);
  };

  const onPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    // Paste as plain text to avoid messy markup; users can re-format as needed.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  return (
    <div className={`${className || ""} ${isFullscreen ? "fixed inset-0 z-[1000] bg-white p-4 overflow-y-auto" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-wrap gap-1 text-sm">
          <button type="button" onClick={() => cmd("undo")} className="px-2 py-1 border rounded">Undo</button>
          <button type="button" onClick={() => cmd("redo")} className="px-2 py-1 border rounded">Redo</button>
          <span className="mx-1" />
          <button type="button" onClick={() => cmd("bold")} className="px-2 py-1 border rounded font-semibold">B</button>
          <button type="button" onClick={() => cmd("italic")} className="px-2 py-1 border rounded italic">I</button>
          <button type="button" onClick={() => cmd("underline")} className="px-2 py-1 border rounded">U</button>
          <button type="button" onClick={() => cmd("removeFormat")} className="px-2 py-1 border rounded" title="Clear formatting">Clear</button>
          <span className="mx-1" />
          <button type="button" onClick={() => makeList(false)} className="px-2 py-1 border rounded">• List</button>
          <button type="button" onClick={() => makeList(true)} className="px-2 py-1 border rounded">1. List</button>
          <button type="button" onClick={unlistSelection} className="px-2 py-1 border rounded">Unlist</button>
          <span className="mx-1" />
          <button type="button" onClick={createLink} className="px-2 py-1 border rounded">Link</button>
          <button type="button" onClick={() => cmd("unlink")} className="px-2 py-1 border rounded">Unlink</button>
          <span className="mx-1" />
          <button type="button" onClick={() => cmd("justifyLeft")} className="px-2 py-1 border rounded">Left</button>
          <button type="button" onClick={() => cmd("justifyCenter")} className="px-2 py-1 border rounded">Center</button>
          <button type="button" onClick={() => cmd("justifyRight")} className="px-2 py-1 border rounded">Right</button>
          <button type="button" onClick={() => cmd("justifyFull")} className="px-2 py-1 border rounded">Justify</button>
          <span className="mx-1" />
          <select onChange={(e) => cmd("foreColor", e.target.value)} className="px-2 py-1 border rounded">
            <option value="">Text color</option>
            <option value="#111827">Black</option>
            <option value="#1f2937">Gray</option>
            <option value="#dc2626">Red</option>
            <option value="#16a34a">Green</option>
            <option value="#2563eb">Blue</option>
            <option value="#f59e0b">Orange</option>
            <option value="#a855f7">Purple</option>
          </select>
          <select onChange={(e) => cmd("fontName", e.target.value)} className="px-2 py-1 border rounded">
            <option value="">Font</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Verdana">Verdana</option>
            <option value="Tahoma">Tahoma</option>
          </select>
          <select onChange={(e) => { const v = Number(e.target.value); if (v) setFontSizePx(v); }} className="px-2 py-1 border rounded" title="Font size">
            <option value="">Font size</option>
            <option value="14">14 px</option>
            <option value="16">16 px</option>
            <option value="18">18 px</option>
            <option value="20">20 px</option>
            <option value="24">24 px</option>
            <option value="28">28 px</option>
            <option value="32">32 px</option>
          </select>
          <select onChange={(e) => cmd("formatBlock", e.target.value)} className="px-2 py-1 border rounded">
            <option value="">Paragraph</option>
            <option value="H2">H2</option>
            <option value="H3">H3</option>
            <option value="H4">H4</option>
            <option value="BLOCKQUOTE">Quote</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="px-2 py-1 border rounded text-xs"
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>
      <div
        ref={ref}
        role="textbox"
        contentEditable
        dir={rtl ? "rtl" : undefined}
        className={`w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 prose max-w-none ${isFullscreen ? "min-h-[60vh]" : "min-h-[160px]"}`}
        onInput={onInput}
        onPaste={onPaste}
        data-placeholder={placeholder || "Type here..."}
        suppressContentEditableWarning
      />
      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af; /* gray-400 */
        }
        :global(.prose blockquote) { border-left: 4px solid #e5e7eb; padding-left: 0.75rem; color: #374151; }
        /* Ensure bullets/numbers are visible even without typography plugin */
        :global(.rte-force-ul) { list-style-type: disc; margin-left: 1.25rem; padding-left: 0.25rem; }
        :global(.rte-force-ol) { list-style-type: decimal; margin-left: 1.25rem; padding-left: 0.25rem; }
      `}</style>
    </div>
  );
}
