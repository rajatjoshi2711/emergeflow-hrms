import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const policySchema = z.object({
  applicableYear: z.number().int(),
  maxFloatingHolidaysPerEmp: z.number().int().min(0),
});

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = policySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const policy = await prisma.holidayPolicy.upsert({
    where: { applicableYear: parsed.data.applicableYear },
    update: { maxFloatingHolidaysPerEmp: parsed.data.maxFloatingHolidaysPerEmp },
    create: parsed.data,
  });

  return NextResponse.json({ policy });
}
