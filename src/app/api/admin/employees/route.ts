import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createEmployee } from "@/lib/employees";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  employeeCode: z.string().min(1),
  role: z.enum(["admin", "hr", "employee"]),
  employmentType: z.enum(["full_time", "intern"]),
  joinDate: z.string(),
  assignedAdminId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the form and try again" }, { status: 400 });
  }

  const result = await createEmployee({
    ...parsed.data,
    joinDate: new Date(`${parsed.data.joinDate}T00:00:00.000Z`),
    assignedAdminId: parsed.data.assignedAdminId || null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // The password is returned once, here, and never stored in plain text.
  return NextResponse.json(
    {
      employee: {
        id: result.employee.id,
        name: result.employee.name,
        email: result.employee.email,
        employeeCode: result.employee.employeeCode,
        role: result.employee.role,
      },
      password: result.password,
    },
    { status: 201 }
  );
}
