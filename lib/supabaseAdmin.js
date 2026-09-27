import { createClient } from '@supabase/supabase-js';

let cached = null;

/**
 * Service-role client. Bypasses RLS entirely — used only from API routes running
 * on the server, never sent to the browser. Lazily created so a missing env var
 * fails the one request that needed it, not the whole build.
 */
export function supabaseAdmin() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured on this deployment');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
