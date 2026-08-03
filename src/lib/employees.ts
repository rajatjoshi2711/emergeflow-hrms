import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { EmploymentType, Role } from "@/generated/prisma/enums";
import type { EmployeeModel } from "@/generated/prisma/models/Employee";

export type CreateEmployeeInput = {
  email: string;
  name: string;
  employeeCode: string;
  role: Role;
  employmentType: EmploymentType;
  joinDate: Date;
  /** Employee id of the approving admin. Required for non-admins. */
  assignedAdminId?: string | null;
  /** Omit to have one generated. */
  password?: string;
};

export type CreateEmployeeResult =
  | { ok: true; employee: EmployeeModel; password: string; generated: boolean }
  | { ok: false; status: number; error: string };

export function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const employeeCode = input.employeeCode.trim();

  if (!email || !name || !employeeCode) {
    return { ok: false, status: 400, error: "Name, email, and employee code are required" };
  }
  if (Number.isNaN(input.joinDate.getTime())) {
    return { ok: false, status: 400, error: "Join date is not a valid date" };
  }

  const [emailTaken, codeTaken] = await Promise.all([
    prisma.employee.findUnique({ where: { email } }),
    prisma.employee.findUnique({ where: { employeeCode } }),
  ]);
  if (emailTaken) return { ok: false, status: 409, error: `${email} is already registered` };
  if (codeTaken) return { ok: false, status: 409, error: `Employee code ${employeeCode} is already taken` };

  // Admins approve for themselves; everyone else needs an approver or their
  // requests would have nowhere to go.
  let assignedAdminId: string | null = null;
  if (input.role === "admin") {
    if (input.assignedAdminId) {
      return { ok: false, status: 400, error: "Admins do not get an approving admin" };
    }
  } else {
    if (!input.assignedAdminId) {
      return { ok: false, status: 400, error: "Choose the admin who will approve their requests" };
    }
    const admin = await prisma.employee.findUnique({ where: { id: input.assignedAdminId } });
    if (!admin || admin.role !== "admin") {
      return { ok: false, status: 400, error: "Approver must be an existing admin" };
    }
    assignedAdminId = admin.id;
  }

  const generated = !input.password;
  const password = input.password ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const employee = await prisma.employee.create({
    data: {
      employeeCode,
      name,
      email,
      passwordHash,
      role: input.role,
      employmentType: input.employmentType,
      joinDate: input.joinDate,
      assignedAdminId,
    },
  });

  return { ok: true, employee, password, generated };
}
