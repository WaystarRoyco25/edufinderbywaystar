import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  loadServiceOwnership,
  type ServiceOwnership,
} from "@/lib/dashboard/ownership";
import DashboardSidebar from "./dashboard-sidebar";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Auth is enforced per page, not here. Next.js layouts do not re-render when
  // navigating between sibling tabs, so a guard placed in this layout would
  // not re-check the session on a tab switch. The user is read only to
  // resolve service ownership for the sidebar; a logged-out visitor is
  // redirected by each page's own requireDashboardUser guard.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let ownership: ServiceOwnership = {
    challenge: false,
    insight: false,
    genius: false,
  };
  if (user) {
    ownership = await loadServiceOwnership(
      createSupabaseAdminClient(),
      user.id,
    );
  }

  return (
    <>
      <header className="bg-[#3b82f6] text-white py-4 shadow-md">
        <div className="container mx-auto px-4">
          <Link
            href="/"
            className="inline-flex items-center text-xl font-bold tracking-wide hover:opacity-90 transition"
          >
            <span className="mr-2 text-sm opacity-80">←</span>EduFinder
          </Link>
        </div>
      </header>

      <div className="flex-1 bg-gray-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:flex-row sm:p-6">
          <DashboardSidebar ownership={ownership} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>

      <footer className="bg-[#1f2937] text-white text-center py-6">
        <p>&copy; 2026 EduFinder by Waystar</p>
      </footer>
    </>
  );
}
