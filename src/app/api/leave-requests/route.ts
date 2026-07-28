import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { LEAVE_TYPE_ID, dayAmount, enumerateDates, getLeaveBalance } from "@/lib/leave";

const createRequestSchema = z.object({
  leaveCode: z.enum(["planned", "unplanned"]),
  startDate: z.string(),
  endDate: z.string(),
  dayPart: z.enum(["full", "first_half", "second_half"]).default("full"),
  reason: z.string().optional(),
});

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: session.employeeId },
    include: { days: true, leaveType: true },
    orderBy: { requestedAt: "desc" },
  });

  return NextResponse.json({ requests });
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

  const { leaveCode, dayPart, reason } = parsed.data;
  const startDate = new Date(parsed.data.startDate);
  const endDate = new Date(parsed.data.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const dates = enumerateDates(startDate, endDate);
  const year = startDate.getUTCFullYear();
  if (endDate.getUTCFullYear() !== year) {
    return NextResponse.json(
      { error: "Requests can't span across two calendar years" },
      { status: 400 }
    );
  }

  if (dates.length > 1 && dayPart !== "full") {
    return NextResponse.json(
      { error: "Half-day requests must be a single day" },
      { status: 400 }
    );
  }

  const today = startOfToday();
  const isRetroactive = dates.some((date) => date.getTime() < today.getTime());

  if (leaveCode === "planned" && isRetroactive) {
    return NextResponse.json(
      { error: "Planned leave can't be requested for past dates" },
      { status: 400 }
    );
  }

  const leaveTypeId = LEAVE_TYPE_ID[leaveCode];
  const requestedAmount = dates.reduce((sum) => sum + dayAmount(dayPart), 0);

  const balance = await getLeaveBalance(session.employeeId, leaveTypeId, year);
  if (requestedAmount > balance.available) {
    return NextResponse.json(
      { error: `Only ${balance.available} ${leaveCode} day(s) available this year` },
      { status: 400 }
    );
  }

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      employeeId: session.employeeId,
      leaveTypeId,
      reason,
      isRetroactive,
      days: {
        create: dates.map((date) => ({ leaveDate: date, dayPart })),
      },
    },
    include: { days: true, leaveType: true },
  });

  return NextResponse.json({ request: leaveRequest }, { status: 201 });
}
