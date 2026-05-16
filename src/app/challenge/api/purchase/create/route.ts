import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createPayPalOrder, isPackageKey } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * Creates a PayPal order for the requested Challenge! Series package.
 *
 * Body: { package: "three" | "five" }
 * Response: { id: "<paypal order id>" } — fed straight back to the
 * PayPal Buttons `createOrder` callback on the client.
 *
 * The price is decided here on the server, so the client can only pick a
 * package, never an amount.
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
    package?: unknown;
  };
  if (!isPackageKey(body.package)) {
    return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  }

  const result = await createPayPalOrder(body.package, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ id: result.id });
}
