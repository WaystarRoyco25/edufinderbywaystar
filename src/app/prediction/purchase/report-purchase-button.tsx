"use client";

import { useEffect, useRef, useState } from "react";

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
// Where the buyer lands after paying: ?start=1 reopens the report intake.
const INTAKE_URL = "/prediction?start=1";

export default function ReportPurchaseButton({
  paypalClientId,
  price,
  startingOver,
}: {
  paypalClientId: string;
  price: string;
  startingOver: boolean;
}) {
  const [sdkState, setSdkState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

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

  useEffect(() => {
    if (sdkState !== "ready" || renderedRef.current) return;
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
          const res = await fetch("/prediction/api/purchase/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
          const res = await fetch("/prediction/api/purchase/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const result = (await res.json().catch(() => null)) as {
            ok?: boolean;
            error?: string;
          } | null;
          if (!res.ok || !result?.ok) {
            setError(
              result?.error ??
                "Your payment went through but we could not unlock your report. Please contact support.",
            );
            return;
          }
          setPaid(true);
          window.setTimeout(() => {
            window.location.href = INTAKE_URL;
          }, 2500);
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
  }, [sdkState]);

  if (paid) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-bold text-green-900">Payment complete</p>
        <p className="mt-1 text-sm text-green-800">
          Your Insight! Report is unlocked. Taking you to the intake...
        </p>
        <p className="mt-3 text-sm">
          <a
            href={INTAKE_URL}
            className="font-semibold text-[#3b82f6] hover:underline"
          >
            Start your report now
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Insight! Report</h2>
      <p className="mt-1 text-sm text-gray-600">
        One full personalized admission-chance report.
      </p>
      <p className="mt-2 text-3xl font-bold text-[#3b82f6]">${price}</p>
      <p className="text-xs text-gray-400">USD, one-time payment</p>
      {startingOver && (
        <p className="mt-2 text-xs text-amber-700">
          Completing this purchase clears your current report and saved intake
          answers.
        </p>
      )}
      {sdkState === "error" && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          PayPal could not load. Please refresh the page and try again.
        </p>
      )}
      <div className="mt-4 min-h-[44px]">
        {sdkState === "ready" ? (
          <div ref={containerRef} />
        ) : (
          <p className="text-xs text-gray-400">Loading PayPal...</p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
