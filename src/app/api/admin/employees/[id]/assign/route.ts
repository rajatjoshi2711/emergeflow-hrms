import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const assignSchema = z.object({ assignedAdminId: z.string() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [target, newAdmin] = await Promise.all([
    prisma.employee.findUnique({ where: { id } }),
    prisma.employee.findUnique({ where: { id: parsed.data.assignedAdminId } }),
  ]);

  if (!target || target.role === "admin") {
    return NextResponse.json({ error: "Employee not found or is an admin" }, { status: 404 });
  }
  if (!newAdmin || newAdmin.role !== "admin") {
    return NextResponse.json({ error: "Target is not an admin" }, { status: 400 });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { assignedAdminId: newAdmin.id },
  });

  return NextResponse.json({ employee: updated });
}
