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
  const [autoPosters, setAutoPosters] = useState<Record<number, string>>({});
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    // Enable zoom only for devices that support hover and have a fine pointer (e.g., mouse/trackpad)
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    } else {
      // Safari fallback
      mq.addListener?.(update);
      return () => mq.removeListener?.(update);
    }
  }, []);

  const safeIndex = useMemo(() => Math.min(Math.max(index, 0), Math.max(0, items.length - 1)), [index, items.length]);
  const preferredInitialIndex = useMemo(() => {
    for (let i = 0; i < items.length; i++) {
      const it: any = items[i];
      if (!it) continue;
      if (it.type === 'image') return i;
      if (it.type === 'video' && (it.poster || autoPosters[i])) return i;
    }
    return 0;
  }, [items, autoPosters]);

  useEffect(() => {
    // If the current slide is a video without poster and a better initial exists, switch to it.
    const cur: any = items[index];
    const curIsBlackVideo = cur && cur.type === 'video' && !(cur.poster || autoPosters[index]);
    if (curIsBlackVideo && preferredInitialIndex !== index) {
      setIndex(preferredInitialIndex);
    }
  }, [items, index, preferredInitialIndex, autoPosters]);

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

  // Fallback: generate poster for any video without a provided poster
  useEffect(() => {
    const gen = async (i: number) => {
      const it = items[i] as any;
      if (!it || it.type !== 'video' || it.poster || autoPosters[i]) return;
      try {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.src = it.src as string;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            const target = Math.min(Math.max(0.1, 1), Math.max(0.1, video.duration - 0.1));
            const onSeeked = () => {
              try {
                const w = Math.max(1, video.videoWidth);
                const h = Math.max(1, video.videoHeight);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('no canvas')); return; }
                ctx.drawImage(video, 0, 0, w, h);
                const url = canvas.toDataURL('image/jpeg', 0.9);
                setAutoPosters(prev => ({ ...prev, [i]: url }));
                resolve();
              } catch (e) { reject(e as any); }
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            try { video.currentTime = target; } catch { reject(new Error('seek failed')); }
          };
          video.onerror = () => reject(new Error('video load error'));
        });
      } catch (e) {
        // silently ignore; keep black fallback
      }
    };
    // Attempt for all items (covers mobile thumbnail rail)
    for (let i = 0; i < Math.min(items.length, 12); i++) gen(i);
  }, [items, autoPosters]);

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
                <>
                  {autoPosters[i] ? (
                    <Image src={autoPosters[i]} alt={it.alt ?? `Thumbnail ${i + 1}`} fill sizes="88px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center bg-black text-white text-xs">VID</div>
                  )}
                  {/* Play badge */}
                  <div className="absolute right-1 bottom-1 bg-black/70 text-white rounded-full p-1 leading-none">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </>
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
                onMouseEnter={() => { if (canHover) setIsZoom(true); }}
                onMouseLeave={() => { if (canHover) setIsZoom(false); }}
                onMouseMove={(e) => {
                  if (!canHover) return;
                  const rect = (e.currentTarget as HTMLImageElement).getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  setOrigin({ x, y });
                }}
                priority={safeIndex === 0}
              />
            </>
          ) : (
            <>
              <video
                controls
                className="absolute inset-0 w-full h-full object-contain bg-black"
                poster={((items[safeIndex] as any).poster as any) || autoPosters[safeIndex]}
              >
                <source src={(items[safeIndex] as any).src} />
              </video>
              {/* Center play badge over poster */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="bg-black/45 rounded-full p-3 md:p-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </>
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
                  i === safeIndex ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{ width: 56, height: 56, flex: '0 0 auto' }}
              >
                {it.type === 'image' ? (
                  <Image
                    src={(it.thumb ?? it.src) as any}
                    alt={it.alt ?? `Thumbnail ${i + 1}`}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <>
                    {autoPosters[i] ? (
                      <Image src={autoPosters[i]} alt={it.alt ?? `Thumbnail ${i + 1}`} fill sizes="56px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center bg-black text-white text-xs">VID</div>
                    )}
                    {/* Play badge */}
                    <div className="absolute right-1 bottom-1 bg-black/70 text-white rounded-full p-1 leading-none">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
