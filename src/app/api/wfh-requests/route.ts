import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getWfhBalance } from "@/lib/leave";

const createRequestSchema = z.object({
  wfhDate: z.string(),
});

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const wfhDate = new Date(parsed.data.wfhDate);
  if (Number.isNaN(wfhDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const today = startOfToday();
  if (wfhDate.getTime() < today.getTime()) {
    return NextResponse.json({ error: "WFH can't be requested for past dates" }, { status: 400 });
  }

  const year = wfhDate.getUTCFullYear();
  const balance = await getWfhBalance(session.employeeId, year);
  if (balance.available < 1) {
    return NextResponse.json({ error: "No WFH days available this year" }, { status: 400 });
  }

  const wfhRequest = await prisma.wfhRequest.create({
    data: { employeeId: session.employeeId, wfhDate },
  });

  return NextResponse.json({ request: wfhRequest }, { status: 201 });
}
