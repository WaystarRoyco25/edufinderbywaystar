import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { capturePayPalOrder, CURRENCY, PACKAGES } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * Captures an approved PayPal order and records the purchase, which is
 * what grants the buyer their practice tests.
 *
 * Body: { orderID: "<paypal order id>" }
 * Response: { ok: true, tests_granted: number }
 *
 * Idempotent: the `purchases.paypal_order_id` unique index means a retried
 * or double-fired capture grants the tests only once.
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

  // If this order was already recorded, the tests are already granted.
  // Re-firing capture (double click, retry) is a safe no-op.
  const existing = await admin
    .from("purchases")
    .select("user_id, tests_granted")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (existing.data) {
    if (existing.data.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      tests_granted: existing.data.tests_granted,
    });
  }

  const capture = await capturePayPalOrder(orderId);
  if (!capture.ok) {
    // A concurrent capture may have just recorded the purchase.
    const raced = await admin
      .from("purchases")
      .select("tests_granted")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    if (raced.data) {
      return NextResponse.json({
        ok: true,
        tests_granted: raced.data.tests_granted,
      });
    }
    return NextResponse.json({ error: capture.error }, { status: 502 });
  }

  // `custom_id` was stamped onto the order server-side at creation time,
  // so a buyer cannot point someone else's payment at their own account.
  if (capture.userId !== user.id || !capture.packageKey) {
    return NextResponse.json(
      { error: "This payment does not belong to your account" },
      { status: 403 },
    );
  }

  const pkg = PACKAGES[capture.packageKey];
  if (capture.amountValue !== pkg.price || capture.amountCurrency !== CURRENCY) {
    return NextResponse.json(
      { error: "Payment amount did not match the package price" },
      { status: 409 },
    );
  }

  const insert = await admin.from("purchases").insert({
    user_id: user.id,
    package: capture.packageKey,
    tests_granted: pkg.tests,
    amount_value: capture.amountValue,
    amount_currency: capture.amountCurrency,
    paypal_order_id: orderId,
    paypal_capture_id: capture.captureId,
  });
  if (insert.error) {
    // Most likely a unique-violation race: another request recorded it first.
    const raced = await admin
      .from("purchases")
      .select("tests_granted")
      .eq("paypal_order_id", orderId)
      .maybeSingle();
    if (raced.data) {
      return NextResponse.json({
        ok: true,
        tests_granted: raced.data.tests_granted,
      });
    }
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tests_granted: pkg.tests });
}
