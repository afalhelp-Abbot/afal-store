"use client";

import React, { useMemo, useState } from "react";

export type EmailRow = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  city: string | null;
  province_code: string | null;
  last_order_at: string | null;
  source: string | null;
};

export type EmailTemplate = {
  code: string;
  name: string;
  subject_tpl: string;
  body_tpl: string;
};

export function EmailListClient({ rows, templates }: { rows: EmailRow[]; templates: EmailTemplate[] }) {
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>(templates[0]?.code || "");
  const [promoCode, setPromoCode] = useState<string>("");

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  // Include a synthetic blank template option for free-form emails
  const allTemplates: EmailTemplate[] = useMemo(
    () => [{ code: "", name: "(No template)", subject_tpl: "", body_tpl: "" }, ...templates],
    [templates],
  );

  const resolveTemplate = (): EmailTemplate | null => {
    const byCode = allTemplates.find((t) => t.code === selectedTemplate);
    return byCode || allTemplates[0] || null;
  };

  const applyTemplate = (tpl: EmailTemplate | null, row: EmailRow): { subject: string; body: string } => {
    const baseSubject = tpl?.subject_tpl || "Special offer from Afal Store";
    const baseBody = tpl?.body_tpl ||
      'Hi {name},\n\nThank you for shopping with Afal Store.\n\nRegards,\nAfal Store';

    const replaceAll = (s: string) =>
      s
        .replaceAll('{name}', (row.name || '').trim())
        .replaceAll('{email}', (row.email || '').trim())
        .replaceAll('{phone}', (row.phone || '').trim())
        .replaceAll('{city}', (row.city || '').trim())
        .replaceAll('{province_code}', (row.province_code || '').trim())
        .replaceAll('{promo_code}', promoCode.trim());

    return {
      subject: replaceAll(baseSubject),
      body: replaceAll(baseBody),
    };
  };

  const allSelectable = useMemo(() => rows.filter((r) => !!(r.email || "").trim()), [rows]);
  const allSelected = allSelectable.length > 0 && allSelectable.every((r) => selectedIds[r.id]);

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) {
      for (const r of allSelectable) {
        next[r.id] = true;
      }
    }
    setSelectedIds(next);
  };

  const handleEmailSelected = () => {
    const selected = rows.filter((r) => selectedIds[r.id] && (r.email || "").trim());
    if (!selected.length) return;
    const tpl = resolveTemplate();
    for (const r of selected) {
      const email = String(r.email || "").trim();
      if (!email) continue;
      const rendered = applyTemplate(tpl, r);
      const subject = encodeURIComponent(rendered.subject || "");
      const body = encodeURIComponent(rendered.body || "");
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        email,
      )}&su=${subject}&body=${body}`;
      try {
        window.open(gmailUrl, "_blank");
      } catch {
        // ignore
      }
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="border rounded px-2 py-1 text-sm min-w-[200px]"
            >
              {allTemplates.map((t) => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Promo code (optional)</label>
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="e.g. AFAL10"
              className="border rounded px-2 py-1 text-sm min-w-[140px]"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-600">
            Selected {rows.filter((r) => selectedIds[r.id]).length} of {rows.length}
          </div>
          <button
            type="button"
            onClick={handleEmailSelected}
            className="inline-flex items-center rounded bg-black px-3 py-1 text-xs font-medium text-white hover:bg-black/90 disabled:bg-gray-300 disabled:text-gray-600"
            disabled={!rows.some((r) => selectedIds[r.id] && (r.email || "").trim())}
          >
            Email selected (Gmail)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">City</th>
              <th className="py-2 pr-4">Last order</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const email = String(r.email || "").trim();
              const tpl = resolveTemplate();
              const rendered = applyTemplate(tpl, r);
              const subject = encodeURIComponent(rendered.subject || "");
              const body = encodeURIComponent(rendered.body || "");
              const gmailUrl = email
                ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    email,
                  )}&su=${subject}&body=${body}`
                : "";
              return (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-2 align-top">
                    {email ? (
                      <input
                        type="checkbox"
                        checked={!!selectedIds[r.id]}
                        onChange={(e) => toggleOne(r.id, e.target.checked)}
                      />
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 align-top">{name || "-"}</td>
                  <td className="py-2 pr-4 align-top">{email || "-"}</td>
                  <td className="py-2 pr-4 align-top">{r.phone || "-"}</td>
                  <td className="py-2 pr-4 align-top">
                    {r.city || "-"} {r.province_code ? `(${r.province_code})` : ""}
                  </td>
                  <td className="py-2 pr-4 align-top">
                    {r.last_order_at ? new Date(r.last_order_at as any).toLocaleString() : "-"}
                  </td>
                  <td className="py-2 pr-4 align-top">{r.source || "-"}</td>
                  <td className="py-2 pr-4 align-top">
                    {email ? (
                      <a
                        href={gmailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded bg-black px-3 py-1 text-xs font-medium text-white hover:bg-black/90"
                      >
                        Email
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">No email</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td className="py-4 text-gray-500" colSpan={8}>
                  No email records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
