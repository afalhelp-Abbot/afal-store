"use client";

import React from "react";

export type SocialLinksProps = {
  fbPageUrl?: string | null;
  instagramUrl?: string | null;
  whatsappUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  fbPageEnabled?: boolean | null;
  instagramEnabled?: boolean | null;
  whatsappEnabled?: boolean | null;
  contactEmailEnabled?: boolean | null;
  contactPhoneEnabled?: boolean | null;
};

function Icon({ kind }: { kind: string }) {
  const cls = "w-8 h-8";
  switch (kind) {
    case "fb":
      return (
        <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#1877F2" />
          <path
            fill="#ffffff"
            d="M13.5 21v-7h2.1l.4-3h-2.5V9.3c0-.9.3-1.3 1.4-1.3h1.1V5.2C15.6 5 14.8 5 13.8 5 11.5 5 10 6.3 10 8.8V11H8v3h2v7h3.5Z"
          />
        </svg>
      );
    case "ig":
      return (
        <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#E1306C" />
          <rect x="7" y="7" width="10" height="10" rx="3" ry="3" fill="none" stroke="#ffffff" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2.7" fill="none" stroke="#ffffff" strokeWidth="1.6" />
          <circle cx="16" cy="8" r="0.9" fill="#ffffff" />
        </svg>
      );
    case "wa":
      return (
        <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#25D366" />
          <path
            fill="#ffffff"
            d="M7.2 18.5 7.8 16A5.4 5.4 0 0 1 6.7 13 5.4 5.4 0 0 1 17 11.9 5.4 5.4 0 0 1 9.8 17l-2.6 1.5Z"
            opacity=".9"
          />
          <path
            fill="#25D366"
            d="M9.7 10.4c-.2-.4-.3-.4-.6-.4h-.4c-.2 0-.4.1-.5.3-.1.2-.9.9-.9 2.1 0 1.2.9 2.3 1 2.4.1.1 1.8 2.9 4.4 3.9.6.2 1 .3 1.3.4.6.2 1.2.2 1.7.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.2.1-1.3-.1-.1-.2-.2-.5-.4s-1.5-.8-1.7-.9c-.2-.1-.4-.1-.5.1-.1.2-.6.9-.8 1.1-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.7-1.1-.6-.5-1.1-1.3-1.2-1.5-.1-.2 0-.3.1-.5.1-.1.2-.3.3-.4.1-.1.1-.2.2-.4.1-.2 0-.3 0-.4l-.7-1.3Z"
          />
        </svg>
      );
    case "mail":
      return (
        <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#4B5563" />
          <path d="M7 9h10v1.5L12 13 7 10.5V9Z" fill="#ffffff" />
          <path d="M7 11.5 12 14l5-2.5V15H7v-3.5Z" fill="#E5E7EB" />
        </svg>
      );
    case "phone":
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#4B5563" />
          <path
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.6"
            d="M9 5h2.5L13 8.5 11 9.7A6.5 6.5 0 0 0 14.3 13l1.2-2.1L19 12.5V15a2 2 0 0 1-2 2 9 9 0 0 1-9-9 2 2 0 0 1 1-1.7Z"
          />
        </svg>
      );
  }
}

export default function SocialLinks({
  fbPageUrl,
  instagramUrl,
  whatsappUrl,
  contactEmail,
  contactPhone,
  fbPageEnabled,
  instagramEnabled,
  whatsappEnabled,
  contactEmailEnabled,
  contactPhoneEnabled,
}: SocialLinksProps) {
  const items: Array<{ key: string; label: string; href?: string }> = [];

  if (fbPageEnabled && fbPageUrl) {
    items.push({ key: "fb", label: "Facebook", href: fbPageUrl });
  }
  if (instagramEnabled && instagramUrl) {
    items.push({ key: "ig", label: "Instagram", href: instagramUrl });
  }
  if (whatsappEnabled && whatsappUrl) {
    items.push({ key: "wa", label: "WhatsApp", href: whatsappUrl });
  }
  if (contactEmailEnabled && contactEmail) {
    items.push({ key: "mail", label: "Email", href: `mailto:${contactEmail}` });
  }
  if (contactPhoneEnabled && contactPhone) {
    items.push({ key: "phone", label: "Phone", href: `tel:${contactPhone}` });
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-4 space-y-2">
      <h2 className="text-sm font-medium text-gray-800">Stay connected</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        {items.map((it) => (
          <a
            key={it.key}
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full w-16 h-16 border border-transparent bg-white shadow-sm hover:shadow text-gray-900 hover:ring-2 hover:ring-black/10"
          >
            <Icon kind={it.key} />
            <span className="sr-only">{it.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
