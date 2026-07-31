import { getSession } from "@/lib/auth";
import { getTodayRoster } from "@/lib/roster";
import { LogoutButton } from "@/components/LogoutButton";
import { TodayRoster } from "@/components/TodayRoster";

export default async function HrDashboard() {
  const session = await getSession();
  const roster = await getTodayRoster();

  return (
    <div className="ef-container-product flex flex-col gap-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="ef-eyebrow">HR</span>
          <h1 className="ef-page">{session?.name}</h1>
        </div>
        <LogoutButton />
      </div>
      <div>
        <h2 className="ef-h3 mb-3">Today&apos;s roster</h2>
        <TodayRoster roster={roster} />
      </div>
    </div>
  );
}
