import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createHolidaySchema = z.object({
  name: z.string().min(1),
  holidayDate: z.string(),
  holidayType: z.enum(["fixed", "floating"]),
  applicableYear: z.number().int(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createHolidaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const holiday = await prisma.holiday.create({
    data: {
      name: parsed.data.name,
      holidayDate: new Date(parsed.data.holidayDate),
      holidayType: parsed.data.holidayType,
      applicableYear: parsed.data.applicableYear,
    },
  });

  return NextResponse.json({ holiday }, { status: 201 });
}
