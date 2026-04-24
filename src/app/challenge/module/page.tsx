import { Suspense } from "react";
import ModuleClient from "./module-client";

export default function ModulePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl p-8 text-sm text-gray-500">
          Loading your practice test...
        </main>
      }
    >
      <ModuleClient />
    </Suspense>
  );
}
