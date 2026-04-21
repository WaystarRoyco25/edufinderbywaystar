import { Suspense } from "react";
import ModuleClient from "./module-client";

export default function ModulePage() {
  return (
    <Suspense fallback={<main className="p-8">모의고사를 불러오는 중...</main>}>
      <ModuleClient />
    </Suspense>
  );
}
