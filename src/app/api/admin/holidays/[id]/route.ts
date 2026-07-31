import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await context.params;
  await prisma.floatingHolidaySelection.deleteMany({ where: { holidayId: id } });
  await prisma.holiday.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
