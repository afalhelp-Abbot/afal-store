"use client";

import Image, { StaticImageData } from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MediaItem =
  | { type: "image"; src: StaticImageData | string; alt?: string; thumb?: StaticImageData | string }
  | { type: "video"; src: string; poster?: StaticImageData | string; alt?: string };

type Props = {
  items: MediaItem[];
  className?: string;
};

export default function ImageGallery({ items, className }: Props) {
  const [index, setIndex] = useState(0);
  const [isZoom, setIsZoom] = useState(false);
  const [origin, setOrigin] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const mainRef = useRef<HTMLDivElement | null>(null);
  const thumbsRef = useRef<HTMLDivElement | null>(null);

  const safeIndex = useMemo(() => Math.min(Math.max(index, 0), Math.max(0, items.length - 1)), [index, items.length]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, items.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    },
    [items.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // Keep thumbnails column height equal to main viewer height; scroll overflow if more thumbs
  useEffect(() => {
    if (!mainRef.current || !thumbsRef.current) return;
    const el = mainRef.current;
    const thumbs = thumbsRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          thumbs.style.maxHeight = `${el.clientHeight}px`;
          thumbs.style.height = `${el.clientHeight}px`;
        }
      }
    });
    ro.observe(el);
    // initialize immediately
    thumbs.style.maxHeight = `${el.clientHeight}px`;
    thumbs.style.height = `${el.clientHeight}px`;
    return () => ro.disconnect();
  }, []);

  if (!items?.length) return null;

  return (
    <div className={"grid grid-cols-1 gap-3 md:grid-cols-[96px_1fr] md:gap-5 " + (className ?? "")}> 
      {/* Thumbnails (left on desktop) */}
      <div className="hidden md:block md:order-1 md:sticky md:top-4 md:self-start">
        <div ref={thumbsRef} className="flex md:flex-col gap-2 overflow-auto pr-1">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Select media ${i + 1}`}
              className={`relative border rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                i === safeIndex ? "ring-2 ring-blue-500" : ""
              }`}
              style={{ width: 88, height: 88, flex: "0 0 auto" }}
            >
              {it.type === "image" ? (
                <Image
                  src={(it.thumb ?? it.src) as any}
                  alt={it.alt ?? `Thumbnail ${i + 1}`}
                  fill
                  sizes="88px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center bg-black text-white text-xs">VID</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main viewer */}
      <div className="order-1 md:order-2">
        <div
          ref={mainRef}
          className="relative w-full md:w-[75%] mx-auto aspect-[1/1] md:aspect-[1/1] bg-white rounded overflow-hidden group shadow-sm"
          onMouseEnter={() => setIsZoom(true)}
          onMouseLeave={() => setIsZoom(false)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setOrigin({ x, y });
          }}
        >
          {items[safeIndex].type === "image" ? (
            <>
              <Image
                src={(items[safeIndex] as any).src}
                alt={(items[safeIndex] as any).alt ?? "Product image"}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain transition-transform duration-150"
                style={{ transformOrigin: `${origin.x}% ${origin.y}%`, transform: isZoom ? "scale(1.8)" : "scale(1)" }}
                priority={safeIndex === 0}
              />
            </>
          ) : (
            <video
              controls
              className="absolute inset-0 w-full h-full object-contain bg-black"
              poster={(items[safeIndex] as any).poster as any}
            >
              <source src={(items[safeIndex] as any).src} />
            </video>
          )}

          {/* Prev/Next arrows */}
          {safeIndex > 0 && (
            <button
              aria-label="Previous image"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/80 hover:bg-white shadow p-2"
            >
              <span className="block select-none">‹</span>
            </button>
          )}
          {safeIndex < items.length - 1 && (
            <button
              aria-label="Next image"
              onClick={() => setIndex((i) => Math.min(i + 1, items.length - 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/80 hover:bg-white shadow p-2"
            >
              <span className="block select-none">›</span>
            </button>
          )}
        </div>
        {/* Mobile thumbnails below */}
        <div className="mt-3 md:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Select media ${i + 1}`}
                className={`relative border rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  i === safeIndex ? "ring-2 ring-blue-500" : ""
                }`}
                style={{ width: 64, height: 64, flex: "0 0 auto" }}
              >
                {it.type === "image" ? (
                  <Image
                    src={(it.thumb ?? it.src) as any}
                    alt={it.alt ?? `Thumbnail ${i + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-black text-white text-xs">VID</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
