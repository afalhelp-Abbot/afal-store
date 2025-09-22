'use client';

import { useEffect } from 'react';
import { setUTMFromURLOnce } from '@/lib/utm';

export default function UTMCapture() {
  useEffect(() => {
    setUTMFromURLOnce();
  }, []);
  return null;
}
