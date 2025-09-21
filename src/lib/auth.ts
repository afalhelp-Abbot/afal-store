import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from './supabaseServer';

export async function getSessionAndProfile() {
  const supabase = getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) return { session: null, profile: null } as const;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, is_admin')
    .eq('id', session.user.id)
    .maybeSingle();

  return { session, profile } as const;
}

export async function requireAdmin() {
  const { session, profile } = await getSessionAndProfile();
  if (!session || !profile?.is_admin) {
    redirect('/admin/login');
  }
  return { session, profile } as const;
}
