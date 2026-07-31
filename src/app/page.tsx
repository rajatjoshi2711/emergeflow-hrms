import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/roles";

export default async function Home() {
  const session = await getSession();
  redirect(session ? ROLE_HOME[session.role] : "/login");
}
