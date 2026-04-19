import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-6">Loading...</main>}>
      <LoginForm />
    </Suspense>
  );
}
