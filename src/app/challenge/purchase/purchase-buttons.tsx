"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PackageOption = {
  key: "three" | "five";
  name: string;
  tests: number;
  price: string;
};

type PayPalButtonsConfig = {
  style?: {
    layout?: "vertical" | "horizontal";
    color?: string;
    shape?: string;
    label?: string;
    height?: number;
  };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
};

type PayPalNamespace = {
  Buttons: (config: PayPalButtonsConfig) => {
    render: (container: HTMLElement) => Promise<void>;
  };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

const PAYPAL_SCRIPT_ID = "paypal-sdk";

export default function PurchaseButtons({
  paypalClientId,
  packages,
}: {
  paypalClientId: string;
  packages: PackageOption[];
}) {
  const router = useRouter();
  const [sdkState, setSdkState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [paid, setPaid] = useState<{ tests: number } | null>(null);

  useEffect(() => {
    // The SDK <script> survives client-side navigation, so on a revisit
    // window.paypal is already defined and no load event will fire again.
    if (window.paypal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync of an already-loaded external SDK
      setSdkState("ready");
      return;
    }
    const existing = document.getElementById(
      PAYPAL_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setSdkState("ready"));
      existing.addEventListener("error", () => setSdkState("error"));
      return;
    }
    const params = new URLSearchParams({
      "client-id": paypalClientId,
      components: "buttons",
      currency: "USD",
      intent: "capture",
      "disable-funding": "venmo",
    });
    const script = document.createElement("script");
    script.id = PAYPAL_SCRIPT_ID;
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => setSdkState("ready");
    script.onerror = () => setSdkState("error");
    document.body.appendChild(script);
  }, [paypalClientId]);

  const handlePaid = useCallback(
    (tests: number) => {
      setPaid({ tests });
      router.refresh();
      window.setTimeout(() => router.push("/dashboard/challenge"), 2500);
    },
    [router],
  );

  if (paid) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-bold text-green-900">Payment complete</p>
        <p className="mt-1 text-sm text-green-800">
          {paid.tests} practice {paid.tests === 1 ? "test has" : "tests have"}{" "}
          been added to your account.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/dashboard/challenge"
            className="font-semibold text-[#3b82f6] hover:underline"
          >
            Go to your dashboard
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sdkState === "error" && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          PayPal could not load. Please refresh the page and try again.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.key}
            pkg={pkg}
            sdkReady={sdkState === "ready"}
            onPaid={handlePaid}
          />
        ))}
      </div>
      <p className="text-sm text-gray-600">
        If you run into any trouble during or after your purchase, email us at{" "}
        <a
          href="mailto:edufinder@waystarlearning.com"
          className="font-semibold text-[#3b82f6] hover:underline"
        >
          edufinder@waystarlearning.com
        </a>{" "}
        and we will fix it promptly.
      </p>
    </div>
  );
}

function PackageCard({
  pkg,
  sdkReady,
  onPaid,
}: {
  pkg: PackageOption;
  sdkReady: boolean;
  onPaid: (tests: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);
  const onPaidRef = useRef(onPaid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  useEffect(() => {
    if (!sdkReady || renderedRef.current) return;
    const paypal = window.paypal;
    const container = containerRef.current;
    if (!paypal || !container) return;
    renderedRef.current = true;

    paypal
      .Buttons({
        style: {
          layout: "vertical",
          shape: "rect",
          color: "blue",
          label: "paypal",
          height: 44,
        },
        createOrder: async () => {
          setError(null);
          const res = await fetch("/challenge/api/purchase/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ package: pkg.key }),
          });
          const data = (await res.json().catch(() => null)) as {
            id?: string;
            error?: string;
          } | null;
          if (!res.ok || !data?.id) {
            const message = data?.error ?? "Could not start checkout.";
            setError(message);
            throw new Error(message);
          }
          return data.id;
        },
        onApprove: async (data) => {
          const res = await fetch("/challenge/api/purchase/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const result = (await res.json().catch(() => null)) as {
            ok?: boolean;
            tests_granted?: number;
            error?: string;
          } | null;
          if (!res.ok || !result?.ok) {
            setError(
              result?.error ??
                "Your payment went through but we could not add the tests. Please contact support.",
            );
            return;
          }
          onPaidRef.current(result.tests_granted ?? pkg.tests);
        },
        onCancel: () => {
          setError(null);
        },
        onError: () => {
          setError("Something went wrong with PayPal. Please try again.");
        },
      })
      .render(container)
      .catch(() => {
        renderedRef.current = false;
        setError(
          "PayPal checkout could not be displayed. Please refresh and try again.",
        );
      });
  }, [sdkReady, pkg]);

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">{pkg.name}</h2>
      <p className="mt-1 text-sm text-gray-600">
        {pkg.tests} full practice tests
      </p>
      <p className="mt-2 text-2xl font-bold text-[#3b82f6]">${pkg.price}</p>
      <p className="text-xs text-gray-400">USD, one-time payment</p>
      <div className="mt-4 min-h-[44px]">
        {sdkReady ? (
          <div ref={containerRef} />
        ) : (
          <p className="text-xs text-gray-400">Loading PayPal...</p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
