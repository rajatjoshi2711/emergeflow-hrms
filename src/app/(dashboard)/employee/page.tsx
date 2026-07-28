import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function EmployeeDashboard() {
  const session = await getSession();

  return (
    <div className="ef-container-product flex flex-col gap-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">Employee</span>
          <h1 className="ef-page">{session?.name}</h1>
          <p className="ef-caption">{session?.employeeCode}</p>
        </div>
        <LogoutButton />
      </div>
      <p className="ef-body">
        Balances, requests, and the floating-holiday picker land in the next build phase.
      </p>
    </div>
  );
}
