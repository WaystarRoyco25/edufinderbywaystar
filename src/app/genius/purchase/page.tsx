import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GENIUS_PRICE } from "@/lib/paypal";
import {
  countAvailableGeniusCredits,
  userHasGeneratedBoard,
} from "@/lib/genius/purchase";
import EditorPurchaseButton from "./editor-purchase-button";

export const dynamic = "force-dynamic";

export default async function GeniusPurchasePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.user_metadata?.password_set) {
    redirect("/challenge/login?next=/genius/purchase");
  }

  const admin = createSupabaseAdminClient();

  // A paid-but-unused credit means there is nothing to buy. Send the user
  // to the dashboard with the editor open inline.
  const credits = await countAvailableGeniusCredits(admin, user.id);
  if (credits > 0) redirect("/dashboard/genius?draft=1");

  const startingOver = await userHasGeneratedBoard(admin, user.id);
  const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";

  return (
    <main className="mx-auto w-full max-w-2xl p-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-wide">The Genius! Editor</h1>
        {startingOver ? (
          <p className="text-sm text-gray-600">
            You already have a Genius! Editor idea board. To build a brand-new
            one, pay for a fresh editor run below. Starting over clears your
            saved editor answers so you begin from a clean slate; your previous
            board stays saved in your dashboard. Pay securely with PayPal and
            your new editor opens as soon as the payment clears.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            The Genius! Editor walks you through 39 discovery questions and
            builds a personalized essay idea board with up to five ranked
            angles. Pay once with PayPal and your editor opens as soon as the
            payment clears.
          </p>
        )}
      </header>

      {paypalClientId ? (
        <EditorPurchaseButton
          paypalClientId={paypalClientId}
          price={GENIUS_PRICE}
          startingOver={startingOver}
        />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Checkout is not available right now. Please try again later.
        </p>
      )}

      <p className="text-sm">
        <a
          href="/genius"
          className="font-semibold text-[#3b82f6] hover:underline"
        >
          ← Back to the Genius! Editor page
        </a>
      </p>
    </main>
  );
}
