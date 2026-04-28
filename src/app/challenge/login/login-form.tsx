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
    // Legacy OTP-only users have no password_set flag; the fact they
    // got here with a password means they set one at some point.
    // Still, mark it explicitly so future logins know.
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
    setInfo("A verification code has been sent to " + email + ".");
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
    // Verified. Does the user already have a password set?
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
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-4 border border-gray-100">
        {step === "password" && (
          <form onSubmit={onPasswordSignIn} className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">Log In</h1>
            <p className="text-sm text-gray-500">
              Log in with your EduFinder account.
            </p>

            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-[#3b82f6]"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-[#3b82f6]"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-green-700">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#3b82f6] px-3 py-2 text-white font-semibold shadow hover:bg-[#3b82f6] disabled:opacity-60 transition"
            >
              {loading ? "..." : "Log In"}
            </button>

            <button
              type="button"
              onClick={() => {
                clearMessages();
                setPassword("");
                setStep("otp-email");
              }}
              className="w-full text-sm text-gray-600 hover:text-gray-800"
            >
              New here? Forgot your password? Sign in with a 6-digit email code.
            </button>
          </form>
        )}

        {step === "otp-email" && (
          <form onSubmit={onSendCode} className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">Email Verification</h1>
            <p className="text-sm text-gray-500">
              We will send a 6-digit verification code to your email.
            </p>

            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-[#3b82f6]"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearMessages();
                  setStep("password");
                }}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 font-medium shadow-sm hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-[#3b82f6] px-3 py-2 text-white font-semibold shadow hover:bg-[#3b82f6] disabled:opacity-60 transition"
              >
                {loading ? "..." : "Send Code"}
              </button>
            </div>
          </form>
        )}

        {step === "otp-code" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">Enter Verification Code</h1>
            <p className="text-sm text-[#3b82f6] font-medium">{info}</p>

            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="Enter the 6-digit code"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setCode(v);
                if (v.length === 6) void verifyCode(v);
              }}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-[#3b82f6] tracking-widest text-center"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearMessages();
                  setCode("");
                  setStep("otp-email");
                }}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 font-medium shadow-sm hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => verifyCode(code)}
                disabled={code.length < 6 || isVerifying}
                className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-white font-semibold shadow hover:bg-green-700 disabled:opacity-60 transition"
              >
                Verify
              </button>
            </div>
          </div>
        )}

        {step === "set-password" && (
          <form onSubmit={onSetPassword} className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">Set Password</h1>
            <p className="text-sm text-gray-500">
              Set the password you will use for future logins. Minimum 8 characters.
            </p>

            <input
              type="password"
              required
              minLength={8}
              placeholder="Password (minimum 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-[#3b82f6]"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Confirm password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-[#3b82f6]"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#3b82f6] px-3 py-2 text-white font-semibold shadow hover:bg-[#3b82f6] disabled:opacity-60 transition"
            >
              {loading ? "..." : "Set Password and Log In"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
