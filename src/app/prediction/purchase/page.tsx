import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { REPORT_PRICE } from "@/lib/paypal";
import {
  countAvailableReportCredits,
  userHasGeneratedReport,
} from "@/lib/report/purchase";
import ReportPurchaseButton from "./report-purchase-button";

export const dynamic = "force-dynamic";

export default async function ReportPurchasePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.user_metadata?.password_set) {
    redirect("/challenge/login?next=/prediction/purchase");
  }

  const admin = createSupabaseAdminClient();

  // A paid-but-unused credit means there is nothing to buy — send the user
  // straight into the intake.
  const credits = await countAvailableReportCredits(admin, user.id);
  if (credits > 0) redirect("/prediction?start=1");

  const startingOver = await userHasGeneratedReport(admin, user.id);
  const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";

  return (
    <main className="mx-auto w-full max-w-2xl p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-wide">The Insight! Report</h1>
        {startingOver ? (
          <p className="text-sm text-gray-600">
            You already have an Insight! Report. To build a brand-new one, pay
            for a fresh report below. Starting over clears your current report
            and the intake answers saved for it, so you begin from a clean
            slate. Pay securely with PayPal and your new intake opens as soon as
            the payment clears.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Your personalized admission-chance report reads public admissions
            data and real applicant cases to estimate your odds at every school
            on your list. Pay once with PayPal and your intake opens as soon as
            the payment clears.
          </p>
        )}
      </header>

      {paypalClientId ? (
        <ReportPurchaseButton
          paypalClientId={paypalClientId}
          price={REPORT_PRICE}
          startingOver={startingOver}
        />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Checkout is not available right now. Please try again later.
        </p>
      )}

      <p className="text-sm">
        <a
          href="/prediction"
          className="font-semibold text-[#3b82f6] hover:underline"
        >
          ← Back to the Insight! Report page
        </a>
      </p>
    </main>
  );
}
