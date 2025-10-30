"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from "chart.js";
import { Pie, Bar } from "react-chartjs-2";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
);

type Expense = {
  id: string;
  name: string;
  amount: number;
  category?: string;
  date: string;
};

export default function ExpensesClient() {
  const storageKey = "jrcomposto:expenses";

  // lazy init from localStorage to avoid setState in effect
  const [income, setIncome] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return typeof parsed.income === "number" ? parsed.income : 0;
    } catch {
      return 0;
    }
  });
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.expenses) ? parsed.expenses : [];
    } catch {
      return [];
    }
  });

  // persist to localStorage whenever income or expenses change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ income, expenses }));
    } catch {
      // ignore
    }
  }, [income, expenses]);

  // --- Server sync: load from server on mount ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/user-data");
        if (!res.ok) return;
        const json = await res.json();
        const server = json?.data ?? null;
        if (!server || !mounted) return;
        if (Array.isArray(server.expenses)) setExpenses(server.expenses);
        if (typeof server.income === "number") setIncome(server.income);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // --- Server sync: POST updated data (debounced) ---
  const syncTimer = useRef<number | null>(null);
  useEffect(() => {
    // don't run on server
    if (typeof window === "undefined") return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(async () => {
      try {
        await fetch("/api/user-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ income, expenses }),
        });
      } catch {
        // ignore errors silently for now
      }
    }, 800) as unknown as number;

    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [income, expenses]);

  const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v);

  const addExpense = () => {
    const parsed = Number(
      amount
        .toString()
        .replace(/[^0-9.,-]/g, "")
        .replace(",", ".")
    );
    if (!name || !parsed || Number.isNaN(parsed)) return;
    const e: Expense = {
      id: generateId(),
      name: name.trim(),
      amount: parsed,
      category: category.trim() || undefined,
      date: new Date().toISOString(),
    };
    setExpenses((s) => [e, ...s]);
    setName("");
    setAmount("");
    setCategory("");
  };

  const removeExpense = (id: string) =>
    setExpenses((s) => s.filter((e) => e.id !== id));

  const totals = useMemo(() => {
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = income - totalExpenses;
    return { totalExpenses, balance };
  }, [income, expenses]);

  // palette para os charts
  const palette = [
    "#34D399",
    "#06B6D4",
    "#F472B6",
    "#F59E0B",
    "#60A5FA",
    "#A78BFA",
    "#F97316",
    "#FB7185",
  ];

  // Totais por categoria
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      const k =
        e.category && e.category.trim() ? e.category.trim() : "Sem categoria";
      map[k] = (map[k] || 0) + e.amount;
    }
    return map;
  }, [expenses]);

  // Gastos por mês (últimos 6 meses)
  const { monthsLabels, monthsValues } = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      monthKeys.push(key);
      months.push(
        d.toLocaleString("pt-BR", { month: "short", year: "2-digit" })
      );
    }
    const sums = monthKeys.map(() => 0);
    for (const e of expenses) {
      try {
        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
        const idx = monthKeys.indexOf(key);
        if (idx >= 0) sums[idx] += e.amount;
      } catch {
        // ignore parse errors
      }
    }
    return { monthsLabels: months, monthsValues: sums };
  }, [expenses]);

  return (
    <div className="space-y-4">
      {/* Card principal: formulário e resumo */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <h2 className="mb-4 text-lg font-medium text-white">
          Gestão de Gastos
        </h2>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
          <div className="col-span-1 md:col-span-1">
            <label className="mb-1 block text-sm text-zinc-300">
              Renda mensal (R$)
            </label>
            <input
              inputMode="decimal"
              value={income}
              onChange={(e) => setIncome(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none"
            />
          </div>
          <div className="col-span-2 md:col-span-2" />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            placeholder="Nome do gasto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="col-span-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100"
          />
          <input
            placeholder="Valor (R$)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100"
          />
          <input
            placeholder="Categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100"
          />
          <div className="col-span-4 md:col-span-1">
            <button
              onClick={addExpense}
              className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"
            >
              Adicionar gasto
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Renda</div>
            <div className="font-medium text-zinc-100">{formatBRL(income)}</div>
          </div>
          <div className="p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Total gastos</div>
            <div className="font-medium text-zinc-100">
              {formatBRL(totals.totalExpenses)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Saldo</div>
            <div
              className={`font-medium ${
                totals.balance < 0 ? "text-rose-400" : "text-emerald-300"
              }`}
            >
              {formatBRL(totals.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Card de gráficos separado */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <div className="mt-0 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-md bg-white/3 p-3">
            <h3 className="mb-2 text-sm text-zinc-300">Gastos por categoria</h3>
            <div>
              <Pie
                data={{
                  labels: Object.keys(categoryTotals),
                  datasets: [
                    {
                      data: Object.values(categoryTotals),
                      backgroundColor: palette.slice(
                        0,
                        Object.keys(categoryTotals).length
                      ),
                      hoverOffset: 6,
                    },
                  ],
                }}
              />
            </div>
          </div>

          <div className="rounded-md bg-white/3 p-3">
            <h3 className="mb-2 text-sm text-zinc-300">
              Gastos por mês (últimos 6 meses)
            </h3>
            <div>
              <Bar
                data={{
                  labels: monthsLabels,
                  datasets: [
                    {
                      label: "Gastos",
                      data: monthsValues,
                      backgroundColor: "rgba(255,99,132,0.6)",
                    },
                  ],
                }}
                options={{
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true } },
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Card da tabela de despesas */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <div className="overflow-auto max-h-64">
          <table className="w-full text-sm">
            <thead className="text-zinc-300 text-left">
              <tr>
                <th className="px-2 py-1">Gasto</th>
                <th className="px-2 py-1">Categoria</th>
                <th className="px-2 py-1">Valor</th>
                <th className="px-2 py-1">Data</th>
                <th className="px-2 py-1"> </th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="px-2 py-1 text-zinc-100">{e.name}</td>
                  <td className="px-2 py-1 text-zinc-300">
                    {e.category ?? "-"}
                  </td>
                  <td className="px-2 py-1 text-zinc-100">
                    {formatBRL(e.amount)}
                  </td>
                  <td className="px-2 py-1 text-zinc-300">
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => removeExpense(e.id)}
                      className="text-rose-400 text-sm"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-4 text-center text-zinc-400"
                  >
                    Nenhum gasto informado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
