import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { captureGeniusPayPalOrder, CURRENCY, GENIUS_PRICE } from "@/lib/paypal";
import { scrapUserGeniusData, userHasGeneratedBoard } from "@/lib/genius/purchase";

export const dynamic = "force-dynamic";

/**
 * Captures an approved PayPal order and records the Genius! Editor
 * purchase, which grants the buyer one editor-run credit.
 *
 * Body: { orderID: "<paypal order id>" }
 * Response: { ok: true }
 *
 * Idempotent: the `genius_purchases.paypal_order_id` unique index means a
 * retried or double-fired capture grants the credit only once.
 *
 * When the buyer already has a generated board, the purchase is them
 * choosing to start over, so their saved editor answers are scrapped right
 * after the credit is recorded. Previously generated boards are kept and
 * stay visible in the dashboard.
 */
export async function POST(request: Request) {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    orderID?: unknown;
  };
  const orderId = typeof body.orderID === "string" ? body.orderID.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // If this order was already recorded, the credit (and any scrap) is
  // already done. Re-firing capture (double click, retry) is a safe no-op;
  // re-running the scrap here could wipe a fresh draft, so we never do.
  const existing = await admin
    .from("genius_purchases")
    .select("user_id")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (existing.data) {
    if (existing.data.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }

  const capture = await captureGeniusPayPalOrder(orderId);
  if (!capture.ok) {
    // A concurrent capture may have just recorded the purchase.
    const raced = await admin
      .from("genius_purchases")
      .select("user_id")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    if (raced.data) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: capture.error }, { status: 502 });
  }

  // `custom_id` was stamped onto the order server-side at creation time,
  // so a buyer cannot point someone else's payment at their own account.
  if (capture.userId !== user.id) {
    return NextResponse.json(
      { error: "This payment does not belong to your account" },
      { status: 403 },
    );
  }
  if (capture.amountValue !== GENIUS_PRICE || capture.amountCurrency !== CURRENCY) {
    return NextResponse.json(
      { error: "Payment amount did not match the editor price" },
      { status: 409 },
    );
  }

  // Decided before the new row exists: a buyer who already has a board is
  // a returning buyer starting over.
  const startingOver = await userHasGeneratedBoard(admin, user.id);

  const insert = await admin.from("genius_purchases").insert({
    user_id: user.id,
    amount_value: capture.amountValue,
    amount_currency: capture.amountCurrency,
    paypal_order_id: orderId,
    paypal_capture_id: capture.captureId,
  });
  if (insert.error) {
    // Most likely a unique-violation race: another request recorded it first.
    const raced = await admin
      .from("genius_purchases")
      .select("user_id")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    if (raced.data) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }

  // Starting over clears the saved editor answers so the buyer returns to a
  // blank editor; previously generated boards are kept. Best effort: the
  // payment is already recorded, so a scrap failure must not fail the whole
  // capture.
  if (startingOver) {
    try {
      await scrapUserGeniusData(admin, user.id);
    } catch (err) {
      console.error("genius scrap after purchase failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
