import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

/** Account link plus sign out, shared by every dashboard header. */
export function HeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <Link href="/account" className="ef-btn ef-btn-secondary">
        Account
      </Link>
      <LogoutButton />
    </div>
  );
}
