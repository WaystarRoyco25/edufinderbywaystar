"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Step = "password" | "otp-email" | "otp-code" | "set-password";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/challenge/dashboard";

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
      setError("이메일 또는 비밀번호가 일치하지 않습니다.");
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
      setError("유효한 이메일 주소를 입력해주세요.");
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
      setError("오류가 발생했습니다: " + error.message);
      return;
    }
    setInfo(email + " (으)로 인증번호가 전송되었습니다.");
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
      setError("인증번호가 일치하지 않거나 만료되었습니다.");
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
      setError("비밀번호는 최소 8자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
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
      setError("비밀번호 설정에 실패했습니다: " + error.message);
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
            <h1 className="text-2xl font-bold tracking-wide">로그인</h1>
            <p className="text-sm text-gray-500">
              EduFinder 계정으로 로그인해주세요.
            </p>

            <input
              type="email"
              required
              placeholder="이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              required
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-blue-500"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-green-700">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white font-semibold shadow hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {loading ? "..." : "로그인"}
            </button>

            <button
              type="button"
              onClick={() => {
                clearMessages();
                setPassword("");
                setStep("otp-email");
              }}
              className="w-full text-sm text-gray-600 underline hover:text-gray-800"
            >
              처음이신가요? / 비밀번호를 잊으셨나요? 6자리 인증번호로 로그인
            </button>
          </form>
        )}

        {step === "otp-email" && (
          <form onSubmit={onSendCode} className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">이메일 인증</h1>
            <p className="text-sm text-gray-500">
              이메일로 6자리 인증번호를 보내드립니다.
            </p>

            <input
              type="email"
              required
              placeholder="이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-blue-500"
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
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-white font-semibold shadow hover:bg-blue-700 disabled:opacity-60 transition"
              >
                {loading ? "..." : "인증번호 전송"}
              </button>
            </div>
          </form>
        )}

        {step === "otp-code" && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">인증번호 입력</h1>
            <p className="text-sm text-blue-600 font-medium">{info}</p>

            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="인증번호 6자리 입력"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setCode(v);
                if (v.length === 6) void verifyCode(v);
              }}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-blue-500 tracking-widest text-center"
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
                뒤로
              </button>
              <button
                type="button"
                onClick={() => verifyCode(code)}
                disabled={code.length < 6 || isVerifying}
                className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-white font-semibold shadow hover:bg-green-700 disabled:opacity-60 transition"
              >
                인증하기
              </button>
            </div>
          </div>
        )}

        {step === "set-password" && (
          <form onSubmit={onSetPassword} className="space-y-4">
            <h1 className="text-2xl font-bold tracking-wide">비밀번호 설정</h1>
            <p className="text-sm text-gray-500">
              다음 로그인부터 사용할 비밀번호를 설정해주세요. (최소 8자)
            </p>

            <input
              type="password"
              required
              minLength={8}
              placeholder="비밀번호 (최소 8자)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="비밀번호 확인"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="w-full rounded-md border px-4 py-2 focus:outline-none focus:border-blue-500"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white font-semibold shadow hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {loading ? "..." : "비밀번호 설정 및 로그인"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
