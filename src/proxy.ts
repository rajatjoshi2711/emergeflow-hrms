import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

const ROLE_PREFIX: Record<string, string> = {
  admin: "/admin",
  hr: "/hr",
  employee: "/employee",
};

function getSecretKey() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

async function readRole(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = await readRole(request);

  if (!role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Everyone manages their own account, whatever their role.
  if (pathname.startsWith("/account")) {
    return NextResponse.next();
  }

  const allowedPrefix = ROLE_PREFIX[role];
  const isOwnArea = allowedPrefix && pathname.startsWith(allowedPrefix);
  // Admins and HR can also view the plain employee dashboard for their own balances.
  const isSharedEmployeeView =
    (role === "admin" || role === "hr") && pathname.startsWith("/employee");

  if (!isOwnArea && !isSharedEmployeeView) {
    return NextResponse.redirect(new URL(allowedPrefix ?? "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/hr/:path*", "/employee/:path*", "/account/:path*"],
};
