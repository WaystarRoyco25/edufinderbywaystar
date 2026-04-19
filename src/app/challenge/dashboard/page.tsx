import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/challenge/login");

  // Legacy OTP-only users (signed up through edufinder before passwords
  // existed) need to set one before they can use SAT_Factory.
  if (!user.user_metadata?.password_set) {
    redirect("/challenge/login?next=/challenge/dashboard");
  }

  const { data: modules } = await supabase
    .from("modules")
    .select("id, created_at, difficulty, score, total, submitted_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <SignOutButton />
      </header>

      <p className="text-gray-600">{user.email} 님으로 로그인됨</p>

      <Link
        href="/challenge/module"
        className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
      >
        새 모의고사 시작하기
      </Link>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">최근 모의고사 기록</h2>
        {!modules || modules.length === 0 ? (
          <p className="text-sm text-gray-500">아직 응시한 모의고사가 없습니다.</p>
        ) : (
          <ul className="divide-y rounded border">
            {modules.map((m) => (
              <li key={m.id} className="flex items-center justify-between p-3">
                <div className="text-sm">
                  <div>{new Date(m.created_at).toLocaleString("ko-KR")}</div>
                  <div className="text-gray-500">{m.difficulty}</div>
                </div>
                <div className="text-sm">
                  {m.submitted_at
                    ? `${m.score} / ${m.total}`
                    : "응시 중"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
