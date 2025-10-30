import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import HeaderClient from "../HeaderClient";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage() {
  const session = await getServerSession(
    authOptions as unknown as import("next-auth").NextAuthOptions
  );
  if (!session) redirect("/login");
  const nameOrEmail =
    (session as unknown as { user?: { name?: string; email?: string } })?.user
      ?.name ??
    (session as unknown as { user?: { name?: string; email?: string } })?.user
      ?.email ??
    "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-zinc-950 via-zinc-900 to-zinc-800">
      {/* Blobs decorativos (same as dashboard) */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <HeaderClient userName={nameOrEmail} title="Gastos" />
      <div className="relative mx-auto max-w-6xl p-6 md:p-10">
        <ExpensesClient />
      </div>
    </div>
  );
}
