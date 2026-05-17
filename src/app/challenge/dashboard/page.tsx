import { redirect } from "next/navigation";

// The Challenge dashboard moved into the unified dashboard hub. This keeps the
// old URL working for existing bookmarks and login redirects.
export default function ChallengeDashboardRedirect() {
  redirect("/dashboard/challenge");
}
