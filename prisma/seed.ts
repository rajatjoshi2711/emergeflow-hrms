import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

const DEV_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const currentYear = new Date().getFullYear();

  await prisma.leaveType.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, code: "planned" },
  });
  await prisma.leaveType.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, code: "unplanned" },
  });

  await prisma.holidayPolicy.upsert({
    where: { applicableYear: currentYear },
    update: {},
    create: { applicableYear: currentYear, maxFloatingHolidaysPerEmp: 2 },
  });

  const adminA = await prisma.employee.upsert({
    where: { email: "admin.a@company.com" },
    update: {},
    create: {
      employeeCode: "ADM-0001",
      name: "Admin A",
      email: "admin.a@company.com",
      passwordHash,
      role: "admin",
      employmentType: "full_time",
      joinDate: new Date("2024-01-01"),
    },
  });

  const adminB = await prisma.employee.upsert({
    where: { email: "admin.b@company.com" },
    update: {},
    create: {
      employeeCode: "ADM-0002",
      name: "Admin B",
      email: "admin.b@company.com",
      passwordHash,
      role: "admin",
      employmentType: "full_time",
      joinDate: new Date("2024-01-01"),
    },
  });

  await prisma.employee.upsert({
    where: { email: "hr@company.com" },
    update: {},
    create: {
      employeeCode: "HR-0001",
      name: "HR One",
      email: "hr@company.com",
      passwordHash,
      role: "hr",
      employmentType: "full_time",
      joinDate: new Date("2024-01-01"),
      assignedAdminId: adminA.id,
    },
  });

  await prisma.employee.upsert({
    where: { email: "employee.ft@company.com" },
    update: {},
    create: {
      employeeCode: "EMP-0001",
      name: "Full Time Employee",
      email: "employee.ft@company.com",
      passwordHash,
      role: "employee",
      employmentType: "full_time",
      joinDate: new Date("2024-06-15"),
      assignedAdminId: adminA.id,
    },
  });

  await prisma.employee.upsert({
    where: { email: "employee.intern@company.com" },
    update: {},
    create: {
      employeeCode: "EMP-0002",
      name: "Intern Employee",
      email: "employee.intern@company.com",
      passwordHash,
      role: "employee",
      employmentType: "intern",
      joinDate: new Date("2026-06-01"),
      assignedAdminId: adminB.id,
    },
  });

  console.log(`Seed complete. Dev login password for all seeded accounts: ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
