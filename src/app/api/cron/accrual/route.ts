import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMonthStart, isQuarterStart } from "@/lib/leave-rules";
import { runFullTimeQuarterlyAccrual, runInternMonthlyAccrual, runWfhMonthlyAccrual } from "@/lib/accrual";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const today = new Date();
  const force = request.nextUrl.searchParams.get("force") === "true";
  const results: Record<string, unknown> = {};

  if (force || isMonthStart(today)) {
    results.intern = await runInternMonthlyAccrual(today);
    results.wfh = await runWfhMonthlyAccrual(today);
  }
  if (force || isQuarterStart(today)) {
    results.fullTime = await runFullTimeQuarterlyAccrual(today);
  }

  return NextResponse.json({ ran: Object.keys(results), results });
}
