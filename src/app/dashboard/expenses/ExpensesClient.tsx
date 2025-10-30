"use client";

import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ income, expenses }));
    } catch {}
  }, [income, expenses]);

  function generateId() {
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  function addExpense() {
    const a =
      Number(
        String(amount)
          .replace(/[^0-9.,-]/g, "")
          .replace(",", ".")
      ) || 0;
    if (!name || a <= 0) return;
    const e: Expense = {
      id: generateId(),
      name: name.trim(),
      amount: a,
      category: category.trim() || undefined,
      date: new Date().toISOString(),
    };
    setExpenses((prev) => [e, ...prev]);
    setName("");
    setAmount("");
    setCategory("");
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((p) => p.id !== id));
  }

  function formatBRL(n: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(n);
  }

  const totals = useMemo(() => {
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = income - totalExpenses;
    return { totalExpenses, balance };
  }, [income, expenses]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <h2 className="mb-4 text-lg font-medium text-white">Gestão de Gastos</h2>

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
                <td className="px-2 py-1 text-zinc-300">{e.category ?? "-"}</td>
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
                <td colSpan={5} className="px-2 py-4 text-center text-zinc-400">
                  Nenhum gasto informado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
