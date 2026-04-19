"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
        router.push("/challenge/login");
        router.refresh();
      }}
      className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
    >
      로그아웃
    </button>
  );
}
