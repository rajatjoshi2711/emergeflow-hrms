/**
 * Exercises runYearEndLapse against whatever DATABASE_URL points at.
 * Intended for an isolated test database - it deliberately zeroes balances.
 *
 * Usage:
 *   DATABASE_URL="...hrms_test..." npx tsx scripts/verify-lapse.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runYearEndLapse } from "../src/lib/accrual";

const YEAR = 2026;

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("hrms_test")) {
    throw new Error("Refusing to run: DATABASE_URL must point at hrms_test");
  }

  // Clean slate
  await prisma.leaveLedgerEntry.deleteMany();
  await prisma.wfhLedgerEntry.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.wfhBalance.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.leaveType.deleteMany();

  await prisma.leaveType.createMany({
    data: [
      { id: 1, code: "planned" },
      { id: 2, code: "unplanned" },
    ],
  });

  const employee = await prisma.employee.create({
    data: {
      employeeCode: "TEST-0001",
      name: "Lapse Test",
      email: "lapse@test.local",
      passwordHash: "x",
      role: "employee",
      employmentType: "full_time",
      joinDate: new Date("2024-01-01"),
    },
  });

  // planned: 8 credited, 3 used -> 5 should lapse
  // unplanned: 8 credited, 8 used -> nothing should lapse
  // wfh: 24 credited, 4 used -> 20 should lapse
  await prisma.leaveBalance.createMany({
    data: [
      { employeeId: employee.id, leaveTypeId: 1, year: YEAR, creditedTotal: 8, used: 3 },
      { employeeId: employee.id, leaveTypeId: 2, year: YEAR, creditedTotal: 8, used: 8 },
    ],
  });
  await prisma.wfhBalance.create({
    data: { employeeId: employee.id, year: YEAR, credited: 24, used: 4 },
  });

  const result = await runYearEndLapse(new Date(`${YEAR}-12-31T00:00:00.000Z`));
  console.log("\nrunYearEndLapse ->", JSON.stringify(result), "\n");

  const planned = await prisma.leaveBalance.findUniqueOrThrow({
    where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: 1, year: YEAR } },
  });
  const unplanned = await prisma.leaveBalance.findUniqueOrThrow({
    where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: 2, year: YEAR } },
  });
  const wfh = await prisma.wfhBalance.findUniqueOrThrow({
    where: { employeeId_year: { employeeId: employee.id, year: YEAR } },
  });

  assert("planned lapsed", Number(planned.lapsed), 5);
  assert("planned remaining after lapse", Number(planned.creditedTotal) - Number(planned.used) - Number(planned.lapsed), 0);
  assert("unplanned lapsed (fully used, nothing left)", Number(unplanned.lapsed), 0);
  assert("wfh lapsed", Number(wfh.lapsed), 20);
  assert("wfh remaining after lapse", Number(wfh.credited) - Number(wfh.used) - Number(wfh.lapsed), 0);

  const ledger = await prisma.leaveLedgerEntry.findMany({ where: { entryType: "lapse" } });
  const wfhLedger = await prisma.wfhLedgerEntry.findMany({ where: { entryType: "lapse" } });
  assert("leave lapse ledger entries", ledger.length, 1);
  assert("wfh lapse ledger entries", wfhLedger.length, 1);

  // Idempotency: a second run must not lapse anything further.
  const second = await runYearEndLapse(new Date(`${YEAR}-12-31T00:00:00.000Z`));
  assert("second run writes no lapse entries", second.lapseEntriesWritten, 0);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
