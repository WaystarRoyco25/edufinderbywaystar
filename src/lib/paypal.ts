import "server-only";

/**
 * PayPal Orders v2 server integration. The Next.js server owns the whole
 * money path: it mints an OAuth token, creates each order with a
 * server-set price, and captures it. The browser only ever sees the
 * opaque order id, so a buyer cannot tamper with the product or amount.
 *
 * Two products run through here: the Challenge! Series test packages and
 * the single-price Insight! Report.
 */

export const CURRENCY = "USD";

// ── Challenge! Series test packages ────────────────────────────────────
export type PackageKey = "three" | "five";

export type PackageDef = {
  key: PackageKey;
  name: string;
  tests: number;
  /** PayPal amount string. Must always carry two decimal places. */
  price: string;
};

export const PACKAGES: Record<PackageKey, PackageDef> = {
  three: { key: "three", name: "Three-Test Package", tests: 3, price: "19.00" },
  five: { key: "five", name: "Five-Test Package", tests: 5, price: "29.00" },
};

export function isPackageKey(value: unknown): value is PackageKey {
  return value === "three" || value === "five";
}

// ── Insight! Report ────────────────────────────────────────────────────
// A single flat price; one purchase unlocks one report.
export const REPORT_PRICE = "59.00";

// ── PayPal REST plumbing ───────────────────────────────────────────────
function apiBase(): string {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error("PayPal credentials are not configured");
  }
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("PayPal auth response carried no access token");
  }
  return data.access_token;
}

export type CreateOrderResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type CreateOrderInput = {
  // Stamped onto the order at creation time so the capture step can trust
  // who and what was paid for. The browser never gets to set it.
  customId: string;
  description: string;
  /** PayPal amount string. Must always carry two decimal places. */
  value: string;
};

// Creates a CAPTURE-intent order with a server-set amount and custom_id.
async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.customId,
            description: input.description,
            amount: { currency_code: CURRENCY, value: input.value },
          },
        ],
      }),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (!res.ok || !data?.id) {
      return {
        ok: false,
        error: `PayPal could not create the order (HTTP ${res.status})`,
      };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "PayPal order creation failed",
    };
  }
}

type PayPalCaptureResponse = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    custom_id?: string;
    payments?: {
      captures?: Array<{
        id?: string;
        custom_id?: string;
        amount?: { currency_code?: string; value?: string };
      }>;
    };
  }>;
};

type RawCaptureResult =
  | {
      ok: true;
      orderId: string;
      captureId: string | null;
      customId: string | null;
      amountValue: string | null;
      amountCurrency: string | null;
    }
  | { ok: false; error: string };

// Captures an approved order and surfaces the custom_id + amount PayPal
// recorded, so callers can re-check who and what was actually paid.
async function captureOrder(orderId: string): Promise<RawCaptureResult> {
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${apiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    const data = (await res
      .json()
      .catch(() => null)) as PayPalCaptureResponse | null;
    if (!res.ok || !data) {
      return {
        ok: false,
        error: `PayPal could not capture the payment (HTTP ${res.status})`,
      };
    }
    if (data.status !== "COMPLETED") {
      return {
        ok: false,
        error: `PayPal payment is not complete (status ${data.status ?? "unknown"})`,
      };
    }
    const unit = data.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    return {
      ok: true,
      orderId: data.id ?? orderId,
      captureId: capture?.id ?? null,
      customId: capture?.custom_id ?? unit?.custom_id ?? null,
      amountValue: capture?.amount?.value ?? null,
      amountCurrency: capture?.amount?.currency_code ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "PayPal capture failed",
    };
  }
}

// ── Challenge! Series wrappers ─────────────────────────────────────────
// The buyer's account id and chosen package are stamped onto the order's
// `custom_id` at creation time, so the capture step can trust them.
function encodeCustomId(userId: string, packageKey: PackageKey): string {
  return `${userId}:${packageKey}`;
}

function decodeCustomId(customId: string | null | undefined): {
  userId: string | null;
  packageKey: PackageKey | null;
} {
  if (!customId) return { userId: null, packageKey: null };
  const sep = customId.indexOf(":");
  if (sep === -1) return { userId: null, packageKey: null };
  const userId = customId.slice(0, sep);
  const key = customId.slice(sep + 1);
  return {
    userId: userId || null,
    packageKey: isPackageKey(key) ? key : null,
  };
}

export function createPayPalOrder(
  packageKey: PackageKey,
  userId: string,
): Promise<CreateOrderResult> {
  const pkg = PACKAGES[packageKey];
  return createOrder({
    customId: encodeCustomId(userId, packageKey),
    description: `EduFinder The Challenge! Series ${pkg.name}`,
    value: pkg.price,
  });
}

export type CaptureOrderResult =
  | {
      ok: true;
      orderId: string;
      captureId: string | null;
      userId: string | null;
      packageKey: PackageKey | null;
      amountValue: string | null;
      amountCurrency: string | null;
    }
  | { ok: false; error: string };

export async function capturePayPalOrder(
  orderId: string,
): Promise<CaptureOrderResult> {
  const result = await captureOrder(orderId);
  if (!result.ok) return { ok: false, error: result.error };
  const { userId, packageKey } = decodeCustomId(result.customId);
  return {
    ok: true,
    orderId: result.orderId,
    captureId: result.captureId,
    userId,
    packageKey,
    amountValue: result.amountValue,
    amountCurrency: result.amountCurrency,
  };
}

// ── Insight! Report wrappers ───────────────────────────────────────────
// A report order stamps the bare buyer id onto `custom_id`; the flat
// REPORT_PRICE is what the capture step verifies.
export function createReportPayPalOrder(
  userId: string,
): Promise<CreateOrderResult> {
  return createOrder({
    customId: userId,
    description: "EduFinder The Insight! Report",
    value: REPORT_PRICE,
  });
}

export type ReportCaptureResult =
  | {
      ok: true;
      orderId: string;
      captureId: string | null;
      userId: string | null;
      amountValue: string | null;
      amountCurrency: string | null;
    }
  | { ok: false; error: string };

export async function captureReportPayPalOrder(
  orderId: string,
): Promise<ReportCaptureResult> {
  const result = await captureOrder(orderId);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    orderId: result.orderId,
    captureId: result.captureId,
    userId: result.customId,
    amountValue: result.amountValue,
    amountCurrency: result.amountCurrency,
  };
}
