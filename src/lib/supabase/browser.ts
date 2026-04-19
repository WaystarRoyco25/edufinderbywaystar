import { createBrowserClient } from "@supabase/ssr";

// Same origin as edufinder (both served from edufinderbywaystar.com),
// so the default host-only session cookie is automatically shared.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
