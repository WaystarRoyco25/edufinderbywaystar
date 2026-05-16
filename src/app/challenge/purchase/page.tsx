import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PACKAGES } from "@/lib/paypal";
import PurchaseButtons from "./purchase-buttons";

export default async function PurchasePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.user_metadata?.password_set) {
    redirect("/challenge/login?next=/challenge/purchase");
  }

  const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";

  return (
    <main className="mx-auto w-full max-w-3xl p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-wide">
          Challenge! Series Practice Tests
        </h1>
        <p className="text-sm text-gray-600">
          Each practice test is one full adaptive exam (Module 1 and Module 2).
          Pick a package and pay securely with PayPal; your tests are added to
          your account as soon as the payment clears.
        </p>
      </header>

      {paypalClientId ? (
        <PurchaseButtons
          paypalClientId={paypalClientId}
          packages={Object.values(PACKAGES)}
        />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Checkout is not available right now. Please try again later.
        </p>
      )}

      <p className="text-sm">
        <Link
          href="/challenge/dashboard"
          className="font-semibold text-[#3b82f6] hover:underline"
        >
          ← Back to your dashboard
        </Link>
      </p>
    </main>
  );
}
