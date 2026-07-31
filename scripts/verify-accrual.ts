/**
 * Exercises runLeaveAccrual / runWfhAccrual against whatever DATABASE_URL
 * points at. Intended for an isolated test database - it wipes and reseeds.
 *
 * Usage:
 *   DATABASE_URL="...hrms_test..." npx tsx scripts/verify-accrual.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runLeaveAccrual, runWfhAccrual } from "../src/lib/accrual";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let failures = 0;
function assert(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function reset() {
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
}

async function makeEmployee(code: string, employmentType: "full_time" | "intern", joinDate: string) {
  return prisma.employee.create({
    data: {
      employeeCode: code,
      name: code,
      email: `${code.toLowerCase()}@test.local`,
      passwordHash: "x",
      role: "employee",
      employmentType,
      joinDate: utc(joinDate),
    },
  });
}

async function credited(employeeId: string, leaveTypeId: number) {
  const b = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: 2026 } },
  });
  return Number(b?.creditedTotal ?? 0);
}

async function wfhCredited(employeeId: string) {
  const b = await prisma.wfhBalance.findUnique({ where: { employeeId_year: { employeeId, year: 2026 } } });
  return Number(b?.credited ?? 0);
}

async function main() {
  if (!(process.env.DATABASE_URL ?? "").includes("hrms_test")) {
    throw new Error("Refusing to run: DATABASE_URL must point at hrms_test");
  }

  await reset();

  const veteran = await makeEmployee("FT-VET", "full_time", "2024-03-01");
  const midQuarter = await makeEmployee("FT-MID", "full_time", "2026-02-15");
  const internEarly = await makeEmployee("IN-EARLY", "intern", "2025-11-01");
  const internMid = await makeEmployee("IN-MID", "intern", "2026-06-16");

  // Run as if it is 1 July 2026: quarters Q1/Q2/Q3 have opened, months Jan..Jul.
  const today = utc("2026-07-01");
  const leave = await runLeaveAccrual(today);
  const wfh = await runWfhAccrual(today);
  console.log("\nrunLeaveAccrual ->", JSON.stringify(leave));
  console.log("runWfhAccrual   ->", JSON.stringify(wfh), "\n");

  // Full-time employed all year: Q1 + Q2 + Q3 opened = 3 * 2 = 6 per type
  assert("FT veteran planned", await credited(veteran.id, 1), 6);
  assert("FT veteran unplanned", await credited(veteran.id, 2), 6);

  // Joined 15 Feb: Q1 prorated to 1, then full 2 for Q2 and Q3 = 5 per type.
  // The old backward-looking proration gave 1 on 1 Apr and nothing for Q1.
  assert("FT mid-quarter joiner planned", await credited(midQuarter.id, 1), 5);
  assert("FT mid-quarter joiner unplanned", await credited(midQuarter.id, 2), 5);

  // Intern employed all year: Jan..Jul = 7 months * 1 = 7 per type
  assert("intern from last year planned", await credited(internEarly.id, 1), 7);

  // Joined 16 Jun: June prorated to 0.5, July full 1 = 1.5 per type
  assert("intern mid-month joiner planned", await credited(internMid.id, 1), 1.5);
  assert("intern mid-month joiner unplanned", await credited(internMid.id, 2), 1.5);

  // WFH is monthly for everyone: Jan..Jul = 7 months * 2 = 14
  assert("WFH veteran", await wfhCredited(veteran.id), 14);
  // Feb joiner: Feb prorated (14 of 28 days -> 1) + Mar..Jul full (5 * 2 = 10) = 11
  assert("WFH FT mid-quarter joiner", await wfhCredited(midQuarter.id), 11);
  // Jun joiner: June prorated (15 of 30 -> 1) + July 2 = 3
  assert("WFH intern mid-month joiner", await wfhCredited(internMid.id), 3);

  // Idempotency
  const rerunLeave = await runLeaveAccrual(today);
  const rerunWfh = await runWfhAccrual(today);
  assert("re-run writes no leave credits", rerunLeave.creditsWritten, 0);
  assert("re-run writes no WFH credits", rerunWfh.creditsWritten, 0);
  assert("FT veteran unchanged after re-run", await credited(veteran.id, 1), 6);

  // Catch-up: advancing to 1 Oct should add exactly Q4 for full-time and Aug/Sep/Oct for interns
  const later = await runLeaveAccrual(utc("2026-10-01"));
  console.log("\ncatch-up run at 1 Oct ->", JSON.stringify(later));
  assert("FT veteran after Q4 opens", await credited(veteran.id, 1), 8);
  assert("intern after Aug/Sep/Oct", await credited(internEarly.id, 1), 10);

  console.log(failures === 0 ? "\nAll assertions passed." : `\n${failures} assertion(s) failed.`);
  if (failures > 0) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
