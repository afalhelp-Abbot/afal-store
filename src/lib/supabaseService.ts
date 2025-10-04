import { createServerClient } from '@supabase/ssr';

// Server-only privileged client using the Service Role key.
// IMPORTANT: Never expose the service role key to the browser.
export function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  // In API routes we do not need cookie-based auth for the service client.
  return createServerClient(supabaseUrl, serviceKey, {
    cookies: {
      get() { return undefined; },
      set() {},
      remove() {},
    },
  });
}
