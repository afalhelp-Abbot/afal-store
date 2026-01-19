'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

type ImageCarouselProps = {
  images: Array<{
    src: string;
    alt: string;
  }>;
  interval?: number;
};

export default function ImageCarousel({ images, interval = 5000 }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  useEffect(() => {
    if (isHovered) return;

    const timer = setInterval(() => {
      setCurrentIndex((current) => (current + 1) % images.length);
    }, interval);

    return () => clearInterval(timer);
  }, [images.length, interval, isHovered]);

  const goToSlide = (index: number) => {
    setDirection(index > currentIndex ? 'next' : 'prev');
    setCurrentIndex(index);
  };

  const nextSlide = () => {
    setDirection('next');
    setCurrentIndex((current) => (current + 1) % images.length);
  };

  const prevSlide = () => {
    setDirection('prev');
    setCurrentIndex((current) => (current - 1 + images.length) % images.length);
  };

  return (
    <div 
      className="relative w-full aspect-square bg-white/5 rounded-xl overflow-hidden group transition-all duration-300 hover:bg-white/10 hover:shadow-lg hover:-translate-y-1"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Images */}
      {images.map((image, index) => (
        <div
          key={image.src}
          className={`absolute inset-0 transition-all duration-500 ${index === currentIndex ? 'opacity-100 translate-x-0' : `opacity-0 ${direction === 'next' ? 'translate-x-full' : '-translate-x-full'}`}`}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-contain p-4 transition-transform duration-500 md:hover:scale-105"
            priority={index === 0}
          />
        </div>
      ))}

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/70 text-black opacity-90 hover:opacity-100 hover:bg-white transition-all duration-300 shadow-sm"
        aria-label="Previous slide"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/70 text-black opacity-90 hover:opacity-100 hover:bg-white transition-all duration-300 shadow-sm"
        aria-label="Next slide"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Dots */}
      <div className="absolute -bottom-10 left-0 right-0 flex justify-center gap-2 transition-all duration-300 group-hover:bottom-4 opacity-0 group-hover:opacity-100">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-blue-600 w-4' : 'bg-blue-400/50 hover:bg-blue-400'}`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
