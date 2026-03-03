'use client';

import { useEffect } from 'react';
import { createOrReuseSession, logLpEvent, getCurrentSessionId } from '@/lib/session';

type Props = {
  productId: string;
  lpSlug: string;
  variantCount?: number;
};

export default function SessionTracker({ productId, lpSlug, variantCount }: Props) {
  useEffect(() => {
    let mounted = true;
    
    const initSession = async () => {
      // Create or reuse session
      const sessionId = await createOrReuseSession(productId, lpSlug);
      
      if (!mounted || !sessionId) return;
      
      // Store entry LP slug for order attribution fallback
      localStorage.setItem('afal_entry_lp_slug', lpSlug);
      
      // Log view_content event
      await logLpEvent('view_content', {
        sessionId,
        metadata: { variant_count: variantCount || 0 },
      });
    };
    
    initSession();
    
    return () => {
      mounted = false;
    };
  }, [productId, lpSlug, variantCount]);
  
  return null;
}
