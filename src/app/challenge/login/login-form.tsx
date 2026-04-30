"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "password" | "otp-email" | "otp-code" | "set-password";

const DEFAULT_NEXT = "/challenge/dashboard";

function safeAuthNext(value: string | null): string {
  if (!value) return DEFAULT_NEXT;

  try {
    const parsed = new URL(value, "https://edufinder.local");
    const isSameOrigin = parsed.origin === "https://edufinder.local";
    const isAllowedPath =
      parsed.pathname === "/prediction" ||
      parsed.pathname === "/prediction.html" ||
      parsed.pathname === "/challenge" ||
      parsed.pathname.startsWith("/challenge/");

    if (!isSameOrigin || !isAllowedPath) return DEFAULT_NEXT;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeAuthNext(searchParams.get("next"));

  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const verifying = useRef(false);

  // Legacy OTP-only users (signed up via edufinder before passwords
  // existed) may arrive here with an active session but no password.
  // Send them straight to the set-password step.
  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (user.user_metadata?.password_set) {
        router.replace(next);
        return;
      }
      setEmail(user.email ?? "");
      setStep("set-password");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearMessages() {
    setError(null);
    setInfo(null);
  }

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("The email or password is incorrect.");
      return;
    }
    if (!data.user?.user_metadata?.password_set) {
      await supabase.auth.updateUser({ data: { password_set: true } });
    }
    router.push(next);
    router.refresh();
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setError("An error occurred: " + error.message);
      return;
    }
    setInfo("A 6-digit code was sent to " + email + ".");
    setCode("");
    setStep("otp-code");
  }

  async function verifyCode(enteredCode: string) {
    if (verifying.current) return;
    if (enteredCode.length < 6) return;
    verifying.current = true;
    setIsVerifying(true);
    clearMessages();
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: enteredCode,
      type: "email",
    });
    verifying.current = false;
    setIsVerifying(false);
    if (error) {
      setCode("");
      setError("The verification code is incorrect or has expired.");
      return;
    }
    if (data.user?.user_metadata?.password_set) {
      router.push(next);
      router.refresh();
      return;
    }
    setStep("set-password");
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();
    if (password.length < 8) {
      setError("Your password must be at least 8 characters long.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });
    setLoading(false);
    if (error) {
      setError("Could not set your password: " + error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-8 bg-gray-100/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header with horizontal EduFinder logo on blue background */}
        <div className="relative bg-[#3b82f6] px-6 pt-7 pb-6 text-center">
          <img
            src="/EduFinder.svg"
            alt="EduFinder by Waystar"
            className="mx-auto h-auto w-44 md:w-48"
          />
        </div>

        {/* Body / forms */}
        <div className="px-6 pt-6 pb-7 space-y-4">
          {step === "password" && (
            <form onSubmit={onPasswordSignIn} className="space-y-3.5">
              <div className="text-center -mt-1 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">Log in</h1>
                <p className="text-sm text-gray-500 mt-1">Use your EduFinder account to continue.</p>
              </div>

              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[0.6rem] border border-gray-200 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.18)] transition"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[0.6rem] border border-gray-200 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.18)] transition"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}
              {info && <p className="text-sm text-green-700">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[0.7rem] bg-[#3b82f6] px-4 py-3 text-white text-base font-bold shadow-[0_4px_14px_rgba(59,130,246,0.25)] hover:bg-[#2563eb] disabled:opacity-60 transition active:translate-y-[1px]"
              >
                {loading ? "..." : "Log in"}
              </button>

              <button
                type="button"
                onClick={() => {
                  clearMessages();
                  setPassword("");
                  setStep("otp-email");
                }}
                className="block w-full text-center text-sm font-semibold text-[#3b82f6] hover:underline pt-2"
              >
                Click here to reset your password or create a new account.
              </button>
            </form>
          )}

          {step === "otp-email" && (
            <form onSubmit={onSendCode} className="space-y-3.5">
              <div className="text-center -mt-1 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">Email Verification</h1>
                <p className="text-sm text-gray-500 mt-1">We will send a 6-digit code to your email.</p>
              </div>

              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[0.6rem] border border-gray-200 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.18)] transition"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    setStep("password");
                  }}
                  className="flex-1 rounded-[0.7rem] border border-gray-200 bg-white px-4 py-3 text-gray-700 font-semibold text-[0.95rem] hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-[0.7rem] bg-[#3b82f6] px-4 py-3 text-white text-base font-bold shadow-[0_4px_14px_rgba(59,130,246,0.25)] hover:bg-[#2563eb] disabled:opacity-60 transition active:translate-y-[1px]"
                >
                  {loading ? "..." : "Send Code"}
                </button>
              </div>
            </form>
          )}

          {step === "otp-code" && (
            <div className="space-y-3.5">
              <div className="text-center -mt-1 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">Enter Code</h1>
                {info && <p className="text-sm text-[#3b82f6] mt-1 font-medium">{info}</p>}
              </div>

              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setCode(v);
                  if (v.length === 6) void verifyCode(v);
                }}
                className="w-full rounded-[0.6rem] border border-gray-200 px-4 py-3 text-[1.15rem] tracking-[0.5em] text-center text-gray-900 focus:outline-none focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.18)] transition"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    setCode("");
                    setStep("otp-email");
                  }}
                  className="flex-1 rounded-[0.7rem] border border-gray-200 bg-white px-4 py-3 text-gray-700 font-semibold text-[0.95rem] hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => verifyCode(code)}
                  disabled={code.length < 6 || isVerifying}
                  className="flex-1 rounded-[0.7rem] bg-green-600 px-4 py-3 text-white text-base font-bold shadow-[0_4px_14px_rgba(22,163,74,0.25)] hover:bg-green-700 disabled:opacity-60 transition active:translate-y-[1px]"
                >
                  Verify
                </button>
              </div>
            </div>
          )}

          {step === "set-password" && (
            <form onSubmit={onSetPassword} className="space-y-3.5">
              <div className="text-center -mt-1 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">Set Password</h1>
                <p className="text-sm text-gray-500 mt-1">Choose the password you&apos;ll use from now on. Min 8 characters.</p>
              </div>

              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (min 8)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[0.6rem] border border-gray-200 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.18)] transition"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Confirm password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full rounded-[0.6rem] border border-gray-200 px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-[#3b82f6] focus:ring-[3px] focus:ring-[rgba(59,130,246,0.18)] transition"
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[0.7rem] bg-[#3b82f6] px-4 py-3 text-white text-base font-bold shadow-[0_4px_14px_rgba(59,130,246,0.25)] hover:bg-[#2563eb] disabled:opacity-60 transition active:translate-y-[1px]"
              >
                {loading ? "..." : "Set Password and Log In"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
