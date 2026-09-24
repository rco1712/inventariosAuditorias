// Config y cliente de Supabase.
// SUPABASE_URL y SUPABASE_ANON_KEY se llenan una vez que crees tu proyecto en supabase.com.
// La "anon key" es pública por diseño (se usa desde el navegador); la seguridad real la dan
// las políticas de RLS definidas en supabase/schema.sql. NUNCA pongas aquí la "service_role key".
export const SUPABASE_URL = 'https://yttsyxswkhlnnsgrtuau.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_bEcvwCsB7mA6HB3EyDQpaQ_d_HkGS8u';

export const supabaseReady = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

let _supabase = null;
export function getSupabase() {
  if (!supabaseReady) return null;
  if (!_supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}
