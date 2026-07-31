import type { NextRequest } from "next/server";

/**
 * Fails closed when CRON_SECRET is unset - otherwise the comparison would be
 * against the literal string "Bearer undefined", which anyone could send.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
