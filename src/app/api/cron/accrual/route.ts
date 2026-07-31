import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runLeaveAccrual, runWfhAccrual } from "@/lib/accrual";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Runs on the 1st of every month. Both runners work out which periods each
 * employee is owed (quarterly for full-time, monthly for interns, monthly WFH
 * for everyone) and skip anything already credited, so this is safe to call
 * on any date and safe to re-run.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const today = new Date();
  const leave = await runLeaveAccrual(today);
  const wfh = await runWfhAccrual(today);

  return NextResponse.json({ leave, wfh });
}
