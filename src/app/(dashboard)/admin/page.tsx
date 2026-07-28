import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminDashboard() {
  const session = await getSession();

  return (
    <div className="ef-container-product flex flex-col gap-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">Admin</span>
          <h1 className="ef-page">{session?.name}</h1>
        </div>
        <LogoutButton />
      </div>
      <p className="ef-body">
        The approval queue, employee assignment, and holiday policy screens land in a
        later build phase.
      </p>
    </div>
  );
}
