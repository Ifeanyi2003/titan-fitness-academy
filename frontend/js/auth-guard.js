import { getSupabase } from './supabase-client.js';

/**
 * Call this at the top of dashboard.html's script.
 * Redirects to login if not authenticated, or to admin.html if the user is an admin.
 */
export async function requireMember() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profile?.role === 'admin') {
    window.location.href = '/admin.html';
    return null;
  }

  return { session, profile, supabase };
}

/**
 * Call this at the top of admin.html's script.
 * Redirects to login if not authenticated or not an admin.
 */
export async function requireAdmin() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profile?.role !== 'admin') {
    window.location.href = '/dashboard.html';
    return null;
  }

  return { session, profile, supabase };
}