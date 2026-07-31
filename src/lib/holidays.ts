import { prisma } from "@/lib/db";

export async function getHolidaysForYear(year: number) {
  return prisma.holiday.findMany({
    where: { applicableYear: year },
    orderBy: { holidayDate: "asc" },
  });
}

export async function getHolidayPolicy(year: number) {
  return prisma.holidayPolicy.findUnique({ where: { applicableYear: year } });
}

export async function getFloatingSelections(employeeId: string, year: number) {
  return prisma.floatingHolidaySelection.findMany({
    where: { employeeId, year },
    include: { holiday: true },
  });
}

export type FloatingSelectionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function selectFloatingHoliday(
  employeeId: string,
  holidayId: string,
  year: number
): Promise<FloatingSelectionResult> {
  const holiday = await prisma.holiday.findUnique({ where: { id: holidayId } });
  if (!holiday || holiday.holidayType !== "floating" || holiday.applicableYear !== year) {
    return { ok: false, status: 404, error: "Floating holiday not found for this year" };
  }

  const existing = await prisma.floatingHolidaySelection.findUnique({
    where: { employeeId_holidayId: { employeeId, holidayId } },
  });
  if (existing) {
    return { ok: false, status: 400, error: "Already selected" };
  }

  const policy = await getHolidayPolicy(year);
  const cap = policy?.maxFloatingHolidaysPerEmp ?? 0;
  const currentCount = await prisma.floatingHolidaySelection.count({ where: { employeeId, year } });
  if (currentCount >= cap) {
    return { ok: false, status: 400, error: `You can select at most ${cap} floating holiday(s) this year` };
  }

  await prisma.floatingHolidaySelection.create({ data: { employeeId, holidayId, year } });
  return { ok: true };
}

export async function removeFloatingSelection(employeeId: string, holidayId: string): Promise<FloatingSelectionResult> {
  const existing = await prisma.floatingHolidaySelection.findUnique({
    where: { employeeId_holidayId: { employeeId, holidayId } },
  });
  if (!existing) {
    return { ok: false, status: 404, error: "Selection not found" };
  }

  await prisma.floatingHolidaySelection.delete({ where: { employeeId_holidayId: { employeeId, holidayId } } });
  return { ok: true };
}
