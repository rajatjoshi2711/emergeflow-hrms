import type { Role } from "@/generated/prisma/enums";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  hr: "/hr",
  employee: "/employee",
};
