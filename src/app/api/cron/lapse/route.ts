import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runYearEndLapse } from "@/lib/accrual";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const result = await runYearEndLapse(new Date());
  return NextResponse.json(result);
}
