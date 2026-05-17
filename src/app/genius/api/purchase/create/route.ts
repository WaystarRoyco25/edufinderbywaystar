import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGeniusPayPalOrder } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * Creates a PayPal order for one Genius! Editor run.
 *
 * Response: { id: "<paypal order id>" } — fed straight back to the PayPal
 * Buttons `createOrder` callback on the client.
 *
 * The Genius! Editor has a single flat price decided on the server, so
 * the client never gets to pick an amount.
 */
export async function POST() {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await createGeniusPayPalOrder(user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ id: result.id });
}
