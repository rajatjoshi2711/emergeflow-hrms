import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runYearEndLapse } from "@/lib/accrual";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const result = await runYearEndLapse(new Date());
  return NextResponse.json(result);
}
