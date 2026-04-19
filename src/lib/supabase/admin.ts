import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER ONLY. The `server-only` import above
 * makes the build fail if this file is ever imported from client code.
 * Used for reads/writes that must bypass RLS (e.g. scoring a module
 * requires reading correct_answer, which users cannot read directly).
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
