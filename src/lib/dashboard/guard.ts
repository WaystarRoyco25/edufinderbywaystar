import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth gate for every /dashboard page. Returns the signed-in user, or
 * redirects to the Challenge login carrying `next` so the user lands back on
 * the page they wanted.
 *
 * This runs per page on purpose. Next.js layouts do not re-render when
 * navigating between sibling pages, so a guard placed in dashboard/layout.tsx
 * would not re-check the session on a tab switch.
 */
export async function requireDashboardUser(currentPath: string): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loginUrl = `/challenge/login?next=${encodeURIComponent(currentPath)}`;
  if (!user) {
    redirect(loginUrl);
  }
  // Legacy OTP-only users (signed up before passwords existed) must set a
  // password before using any authenticated EduFinder service.
  if (!user.user_metadata?.password_set) {
    redirect(loginUrl);
  }
  return user;
}
