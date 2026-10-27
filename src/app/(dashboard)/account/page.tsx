import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roles";
import { LogoutButton } from "@/components/LogoutButton";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <div className="ef-container-product flex flex-col gap-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">Account</span>
          <h1 className="ef-page">{session.name}</h1>
          <p className="ef-caption">
            {session.employeeCode} &middot; {session.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={ROLE_HOME[session.role]} className="ef-btn ef-btn-secondary">
            Back to dashboard
          </Link>
          <LogoutButton />
        </div>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
