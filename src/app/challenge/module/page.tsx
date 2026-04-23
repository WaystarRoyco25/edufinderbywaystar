import { Suspense } from "react";
import ModuleClient from "./module-client";

export default function ModulePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl p-8 text-sm text-gray-500">
          모의고사를 불러오는 중...
        </main>
      }
    >
      <ModuleClient />
    </Suspense>
  );
}
