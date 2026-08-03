/**
 * Creates an employee (including admins) against whatever DATABASE_URL points at.
 *
 * Accounts are created here rather than through a public signup route: the
 * employee code, role, and admin assignment are onboarding decisions, not
 * something a new joiner picks for themselves.
 *
 *   npx tsx scripts/create-employee.ts \
 *     --email rajat@emergeflow.com --name "Rajat" --code ADM-0003 --role admin
 *
 * Options:
 *   --email        required
 *   --name         required
 *   --code         required, unique employee code shown on their dashboard
 *   --role         admin | hr | employee            (default: employee)
 *   --type         full_time | intern               (default: full_time)
 *   --join-date    YYYY-MM-DD                       (default: today)
 *   --assign-admin employee code of their approving admin (required unless --role admin)
 *   --password     set explicitly; omit to have one generated and printed
 *
 * A generated password is printed once and never stored in plain text. Have the
 * person change it after first sign-in.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { createEmployee } from "../src/lib/employees";
import type { EmploymentType, Role } from "../src/generated/prisma/enums";

const ROLES = ["admin", "hr", "employee"] as const;
const TYPES = ["full_time", "intern"] as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const code = arg("code")?.trim();
  const role = (arg("role") ?? "employee") as Role;
  const employmentType = (arg("type") ?? "full_time") as EmploymentType;
  const joinDateRaw = arg("join-date");
  const assignAdminCode = arg("assign-admin")?.trim();
  const explicitPassword = arg("password");

  if (!email) fail("--email is required");
  if (!name) fail("--name is required");
  if (!code) fail("--code is required");
  if (!ROLES.includes(role as (typeof ROLES)[number])) fail(`--role must be one of ${ROLES.join(", ")}`);
  if (!TYPES.includes(employmentType as (typeof TYPES)[number])) fail(`--type must be one of ${TYPES.join(", ")}`);

  const joinDate = joinDateRaw ? new Date(`${joinDateRaw}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(joinDate.getTime())) fail("--join-date must be YYYY-MM-DD");

  // The CLI identifies the approver by employee code; the shared helper wants an id.
  let assignedAdminId: string | null = null;
  if (role !== "admin" && assignAdminCode) {
    const admin = await prisma.employee.findUnique({ where: { employeeCode: assignAdminCode } });
    if (!admin) fail(`no employee found with code ${assignAdminCode}`);
    assignedAdminId = admin.id;
  } else if (role !== "admin") {
    fail("--assign-admin <adminCode> is required unless --role admin");
  } else if (assignAdminCode) {
    fail("--assign-admin cannot be used with --role admin");
  }

  const result = await createEmployee({
    email,
    name,
    employeeCode: code,
    role,
    employmentType,
    joinDate,
    assignedAdminId,
    password: explicitPassword,
  });

  if (!result.ok) fail(result.error);

  const { employee, password, generated } = result;
  console.log(`\nCreated ${employee.role} ${employee.employeeCode} (${employee.name})`);
  console.log(`  email      ${employee.email}`);
  console.log(`  type       ${employee.employmentType}`);
  console.log(`  join date  ${employee.joinDate.toISOString().slice(0, 10)}`);
  if (assignAdminCode) console.log(`  approver   ${assignAdminCode}`);
  console.log(generated ? `\n  Password (shown once): ${password}` : "\n  Password set from --password.");
  console.log("\nLeave accrual starts from the next run of /api/cron/accrual,");
  console.log("which backfills any periods owed since the join date.\n");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
