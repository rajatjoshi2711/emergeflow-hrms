import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { removeFloatingSelection } from "@/lib/holidays";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ holidayId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { holidayId } = await context.params;
  const result = await removeFloatingSelection(session.employeeId, holidayId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
