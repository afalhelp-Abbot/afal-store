"use client";

import React, { useRef } from "react";
import { track } from "@/lib/pixel";

type TrackedVideoProps = {
  src: string;
  poster?: string;
  className?: string;
  productId?: string;
  productName?: string;
  location?: "gallery" | "section";
};

export default function TrackedVideo({ src, poster, className, productId, productName, location = "section" }: TrackedVideoProps) {
  const firedRef = useRef(false);

  const handlePlay: React.VideoHTMLAttributes<HTMLVideoElement>["onPlay"] = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (!productId) return;
    track("VideoPlay", {
      product_id: productId,
      content_name: productName || undefined,
      video_src: src,
      location,
    });
  };

  return (
    <video
      controls
      className={className}
      poster={poster}
      onPlay={handlePlay}
    >
      <source src={src} />
    </video>
  );
}
