import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing || existing.employeeId !== session.employeeId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: "Only pending requests can be cancelled" }, { status: 400 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "cancelled", decidedAt: new Date() },
  });

  return NextResponse.json({ request: updated });
}
