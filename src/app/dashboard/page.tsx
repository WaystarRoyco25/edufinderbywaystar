import { redirect } from "next/navigation";

// The dashboard hub has no landing view of its own; send visitors to the
// Challenge tab, which the sidebar then lets them move freely between.
export default function DashboardIndexPage() {
  redirect("/dashboard/challenge");
}
