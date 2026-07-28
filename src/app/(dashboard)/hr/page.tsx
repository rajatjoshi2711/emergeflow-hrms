import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function HrDashboard() {
  const session = await getSession();

  return (
    <div className="ef-container-product flex flex-col gap-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">HR</span>
          <h1 className="ef-page">{session?.name}</h1>
        </div>
        <LogoutButton />
      </div>
      <p className="ef-body">
        The company-wide roster (who&apos;s in, on leave, or WFH today) lands in a later
        build phase.
      </p>
    </div>
  );
}
