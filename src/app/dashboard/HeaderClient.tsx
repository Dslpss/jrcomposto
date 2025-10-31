"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

export default function HeaderClient({
  userName,
  title = "Dashboard",
}: {
  userName: string;
  title?: string;
}) {
  const pathname = usePathname();
  const initials = useMemo(() => {
    if (!userName) return "";
    const parts = userName.trim().split(/\s+/);
    const a = parts[0]?.charAt(0) ?? "";
    const b = parts[1]?.charAt(0) ?? "";
    return (a + b).toUpperCase();
  }, [userName]);

  return (
    <div className="relative mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold bg-linear-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]">
            {title}
          </h1>
          <span className="hidden sm:inline text-sm text-zinc-400">
            {title === "Dashboard"
              ? "Gerencie seus cenários"
              : "Gerencie suas finanças"}
          </span>

          {/* Navegação */}
          <nav
            aria-label="Navegação principal"
            className="ml-2 hidden md:flex items-center gap-2 rounded-md bg-white/5 p-1 border border-white/10"
            role="navigation"
          >
            <Link href="/dashboard" className={`${pathname?.startsWith("/dashboard/expenses") ? "" : "bg-emerald-500 text-white shadow"} inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10 transition`}>
              <span className="inline-block h-2 w-2 rounded-full bg-current/80" />
              <span>Dashboard</span>
            </Link>
            <Link href="/dashboard/expenses" className={`${pathname?.startsWith("/dashboard/expenses") ? "bg-emerald-500 text-white shadow" : ""} inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10 transition`}>
              <span className="inline-block h-2 w-2 rounded-full bg-current/80" />
              <span>Gastos</span>
            </Link>
          </nav>

          {/* Versão compacta (mobile) */}
          <div className="md:hidden inline-flex items-center gap-2 ml-2">
            <Link href="/dashboard" className={`${pathname?.startsWith("/dashboard/expenses") ? "border-white/20" : "bg-emerald-500 text-white"} rounded-md border border-white/10 px-2 py-1 text-xs`}>Dash</Link>
            <Link href="/dashboard/expenses" className={`${pathname?.startsWith("/dashboard/expenses") ? "bg-emerald-500 text-white" : "border-white/20"} rounded-md border border-white/10 px-2 py-1 text-xs`}>Gastos</Link>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-4 shrink-0">
          <div className="flex items-center gap-3 rounded-md bg-white/3 px-3 py-1 backdrop-blur-sm">
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-semibold text-sm">
              {initials}
            </div>

            <div className="hidden sm:flex sm:flex-col sm:items-start">
              <div className="text-sm text-zinc-100 font-medium truncate max-w-36">
                {userName}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-xs text-zinc-300 hover:text-zinc-100"
              >
                Sair
              </button>
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="sm:hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10 shrink-0"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
