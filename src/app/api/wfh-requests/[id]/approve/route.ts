import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { approveWfhRequest } from "@/lib/leave";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await approveWfhRequest(id, session.employeeId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
