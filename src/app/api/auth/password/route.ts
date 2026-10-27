import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, getSession, setSessionCookie } from "@/lib/auth";

export const MIN_PASSWORD_LENGTH = 10;

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const employee = await prisma.employee.findUnique({ where: { id: session.employeeId } });
  if (!employee || employee.status !== "active") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const currentValid = await bcrypt.compare(currentPassword, employee.passwordHash);
  if (!currentValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const unchanged = await bcrypt.compare(newPassword, employee.passwordHash);
  if (unchanged) {
    return NextResponse.json({ error: "New password must be different" }, { status: 400 });
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  // Re-issue this device's cookie so the person stays signed in. Sessions on
  // other devices keep working until their token expires - see the note in the
  // README about what it would take to revoke them immediately.
  await setSessionCookie(
    await createSessionToken({
      employeeId: employee.id,
      role: employee.role,
      employeeCode: employee.employeeCode,
      name: employee.name,
    })
  );

  return NextResponse.json({ ok: true });
}
