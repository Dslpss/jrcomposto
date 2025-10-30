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

// categorias predefinidas (constante de módulo para estabilidade)
const PREDEFINED_CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Assinaturas",
  "Lazer",
  "Moradia",
  "Saúde",
  "Educação",
  "Compras",
  "Outros",
];

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
  const [savingGoal, setSavingGoal] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return typeof parsed.savingGoal === "number" ? parsed.savingGoal : 0;
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
      return Array.isArray(parsed.expenses)
        ? parsed.expenses.map((e: Expense) => {
            // inline normalization (não depende da função declarada abaixo)
            const raw = e.category;
            const normalized = raw
              ? (() => {
                  const cleaned = raw
                    .toString()
                    .trim()
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/\p{Diacritic}/gu, "")
                    .replace(/[^a-z0-9\s]/g, "")
                    .replace(/\s+/g, " ")
                    .trim();
                  const map: Record<string, string> = {
                    alimentacao: "Alimentação",
                    alimenta: "Alimentação",
                    transporte: "Transporte",
                    assinatura: "Assinaturas",
                    assinaturas: "Assinaturas",
                    lazer: "Lazer",
                    moradia: "Moradia",
                    casa: "Moradia",
                    saude: "Saúde",
                    saudee: "Saúde",
                    educacao: "Educação",
                    educacaoes: "Educação",
                    compras: "Compras",
                    outros: "Outros",
                  };
                  if (map[cleaned]) return map[cleaned];
                  for (const k of Object.keys(map)) {
                    if (cleaned.startsWith(k)) return map[k];
                  }
                  return raw
                    .toString()
                    .trim()
                    .replace(/\s+/g, " ")
                    .split(" ")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");
                })()
              : undefined;
            return { ...e, category: normalized };
          })
        : [];
    } catch {
      return [];
    }
  });

  // persist to localStorage whenever income, expenses or savingGoal change
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ income, expenses, savingGoal })
      );
    } catch {
      // ignore
    }
  }, [income, expenses, savingGoal]);

  // normalização de categoria: remove acentos, espaços e mapeia sinônimos para categorias canônicas
  const normalizeCategory = (input?: string | null) => {
    if (!input) return undefined;
    const cleaned = input
      .toString()
      .trim()
      .toLowerCase()
      // remover acentos
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const map: Record<string, string> = {
      alimentacao: "Alimentação",
      alimenta: "Alimentação",
      transporte: "Transporte",
      assinatura: "Assinaturas",
      assinaturas: "Assinaturas",
      lazer: "Lazer",
      moradia: "Moradia",
      casa: "Moradia",
      saude: "Saúde",
      saudee: "Saúde",
      educacao: "Educação",
      educacaoes: "Educação",
      compras: "Compras",
      outros: "Outros",
    };

    // match exact mapped keys
    if (map[cleaned]) return map[cleaned];

    // tenta casar começando com a palavra (p.ex. 'assinatura mensal')
    for (const k of Object.keys(map)) {
      if (cleaned.startsWith(k)) return map[k];
    }

    // fallback: titulo-case simples (preserva acentos originais via input)
    return input
      .toString()
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

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
        if (Array.isArray(server.expenses))
          setExpenses(
            server.expenses.map((e: Expense) => ({
              ...e,
              category: e.category ? normalizeCategory(e.category) : undefined,
            }))
          );
        if (typeof server.income === "number") setIncome(server.income);
        if (typeof server.savingGoal === "number")
          setSavingGoal(server.savingGoal);
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
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "saved" | "error"
  >("idle");
  useEffect(() => {
    // don't run on server
    if (typeof window === "undefined") return;
    // debounce next sync
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        const res = await fetch("/api/user-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ income, expenses, savingGoal }),
        });
        if (res.ok) {
          setSyncStatus("saved");
          // show 'saved' briefly
          window.setTimeout(() => setSyncStatus("idle"), 1500);
        } else {
          setSyncStatus("error");
        }
      } catch {
        setSyncStatus("error");
      }
    }, 800) as unknown as number;

    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [income, expenses, savingGoal]);

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
      category: category.trim()
        ? normalizeCategory(category.trim())
        : undefined,
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
  const predefinedCategories = PREDEFINED_CATEGORIES;

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

  // Contagem de lançamentos por categoria (número de itens)
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      const k =
        e.category && e.category.trim() ? e.category.trim() : "Sem categoria";
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [expenses]);

  // ordenar categorias predefinidas pela contagem (desc) para mostrar chips mais usados primeiro
  const sortedPredefined = useMemo(() => {
    return predefinedCategories
      .slice()
      .sort((a, b) => (categoryCounts[b] || 0) - (categoryCounts[a] || 0));
  }, [categoryCounts, predefinedCategories]);

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

  // --- Avisos inteligentes: sinais e ações ---
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const { topCategory, topCategoryShare, expenseRatio, trendPercent } =
    useMemo(() => {
      // top category
      const entries = Object.entries(categoryTotals).sort(
        (a, b) => b[1] - a[1]
      );
      const top = entries.length > 0 ? entries[0][0] : null;
      const topVal = entries.length > 0 ? entries[0][1] : 0;
      const total =
        Object.values(categoryTotals).reduce((s, v) => s + v, 0) || 0;
      const topShare = total > 0 ? topVal / total : 0;

      // expense ratio vs income
      const ratio = income > 0 ? totals.totalExpenses / income : 0;

      // trend: compare last 3 months avg vs previous 3 months avg
      const prev = monthsValues.slice(0, 3);
      const last = monthsValues.slice(3, 6);
      const prevAvg = prev.reduce((s, v) => s + v, 0) / (prev.length || 1);
      const lastAvg = last.reduce((s, v) => s + v, 0) / (last.length || 1);
      const trendPercent =
        prevAvg === 0 ? (lastAvg > 0 ? 1 : 0) : (lastAvg - prevAvg) / prevAvg;

      return {
        topCategory: top,
        topCategoryShare: topShare,
        expenseRatio: ratio,
        trendPercent,
      };
    }, [categoryTotals, income, monthsValues, totals.totalExpenses]);

  const warnings = useMemo(() => {
    const list: Array<{
      level: "critical" | "warning" | "ok";
      title: string;
      detail?: string;
    }> = [];

    // expense ratio checks
    if (income > 0) {
      if (expenseRatio >= 0.8) {
        list.push({
          level: "critical",
          title: `Você está gastando ${Math.round(
            expenseRatio * 100
          )}% da renda mensal.`,
          detail:
            "Isso deixa pouca margem para imprevistos. Considere reduzir gastos fixos ou aumentar a renda.",
        });
      } else if (expenseRatio >= 0.5) {
        list.push({
          level: "warning",
          title: `Gastos representam ${Math.round(
            expenseRatio * 100
          )}% da renda.`,
          detail:
            "Monitore categorias altas e veja se há assinaturas ou gastos recorrentes a cortar.",
        });
      } else {
        list.push({
          level: "ok",
          title: "Gastos dentro de um intervalo saudável em relação à renda.",
        });
      }
    } else {
      list.push({
        level: "warning",
        title: "Renda não informada.",
        detail: "Defina sua renda mensal para avaliações mais precisas.",
      });
    }

    // category concentration
    if (topCategory) {
      if (topCategoryShare >= 0.3) {
        list.push({
          level: "warning",
          title: `Concentração alta em '${topCategory}' (${Math.round(
            topCategoryShare * 100
          )}%).`,
          detail:
            "Tentar diversificar ou revisar gastos nessa categoria pode reduzir despesas totais.",
        });
      }
    }

    // trend
    if (trendPercent > 0.1) {
      list.push({
        level: "warning",
        title: `Gastos em tendência de alta (+${Math.round(
          trendPercent * 100
        )}% vs 3 meses anteriores).`,
        detail:
          "Investigue despesas recentes que possam ter aumentado (viagens, eventos, compras).",
      });
    } else if (trendPercent < -0.1) {
      list.push({
        level: "ok",
        title: "Tendência de gastos em queda nas últimas semanas.",
      });
    }

    // saving goal impact
    if (savingGoal > 0) {
      const remaining = savingGoal - totals.balance;
      if (totals.balance < 0) {
        list.push({
          level: "critical",
          title: "Saldo negativo pode comprometer sua meta de economia.",
          detail:
            "Reduza gastos imediatamente ou ajuste a meta para evitar dívidas.",
        });
      } else if (remaining > income * 0.2) {
        list.push({
          level: "warning",
          title: `Faltam ${formatBRL(remaining)} para atingir a meta.`,
          detail: "Considere cortes temporários até atingir a meta desejada.",
        });
      } else if (remaining <= 0) {
        list.push({
          level: "ok",
          title: "Meta de economia alcançada — ótimo trabalho!",
        });
      }
    }

    return list;
  }, [
    expenseRatio,
    income,
    topCategory,
    topCategoryShare,
    trendPercent,
    savingGoal,
    totals,
  ]);

  // filtered datasets (aplicados aos charts quando filterCategory estiver ativo)
  const filteredExpenses = useMemo(() => {
    if (!filterCategory) return expenses;
    return expenses.filter((e) => e.category === filterCategory);
  }, [expenses, filterCategory]);

  const filteredCategoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filteredExpenses) {
      const k =
        e.category && e.category.trim() ? e.category.trim() : "Sem categoria";
      map[k] = (map[k] || 0) + e.amount;
    }
    return map;
  }, [filteredExpenses]);

  const filteredMonthsValues = useMemo(() => {
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      monthKeys.push(key);
    }
    const sums = monthKeys.map(() => 0);
    for (const e of filteredExpenses) {
      try {
        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
        const idx = monthKeys.indexOf(key);
        if (idx >= 0) sums[idx] += e.amount;
      } catch {
        // ignore
      }
    }
    return sums;
  }, [filteredExpenses]);

  const displayCategoryTotals = filterCategory
    ? filteredCategoryTotals
    : categoryTotals;
  const displayMonthsValues = filterCategory
    ? filteredMonthsValues
    : monthsValues;

  return (
    <div className="space-y-4">
      {/* Card principal: formulário e resumo */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Gestão de Gastos</h2>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            {/* Sync indicator */}
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 inline-block">
                {syncStatus === "syncing" ? (
                  <svg
                    className="animate-spin text-zinc-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeOpacity="0.2"
                    />
                    <path
                      d="M22 12a10 10 0 00-10-10"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : syncStatus === "saved" ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-emerald-300"
                  >
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : syncStatus === "error" ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-rose-400"
                  >
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-zinc-400"
                  >
                    <path
                      d="M12 6v6l4 2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeOpacity="0.2"
                    />
                  </svg>
                )}
              </span>
              <span className="whitespace-nowrap">
                {syncStatus === "syncing" && "Sincronizando..."}
                {syncStatus === "saved" && "Salvo"}
                {syncStatus === "error" && "Erro ao salvar"}
                {syncStatus === "idle" && "Sincronizado"}
              </span>
            </div>
          </div>
        </div>

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

          <div className="col-span-1 md:col-span-1">
            <label className="mb-1 block text-sm text-zinc-300">
              Meta (R$)
            </label>
            <input
              inputMode="decimal"
              value={savingGoal}
              onChange={(e) => setSavingGoal(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none"
            />
          </div>

          <div className="col-span-1 md:col-span-1" />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
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
          <div className="col-span-4 mt-2 flex flex-wrap gap-2">
            {sortedPredefined.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`flex items-center gap-2 text-xs px-2 py-1 rounded-full transition-all ${
                  category === c
                    ? "bg-emerald-500 text-white"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`}
              >
                <span>{c}</span>
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] text-zinc-200">
                  {categoryCounts[c] || 0}
                </span>
              </button>
            ))}
          </div>
          <div className="col-span-4 md:col-span-1">
            <button
              onClick={addExpense}
              className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white"
            >
              Adicionar gasto
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
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
          <div className="p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Meta economia</div>
            <div className="font-medium text-zinc-100">
              {formatBRL(savingGoal)}
            </div>
            <div className="text-sm mt-1">
              {savingGoal <= 0 ? (
                <span className="text-zinc-400">Defina uma meta</span>
              ) : savingGoal - totals.balance <= 0 ? (
                <span className="text-emerald-300">Meta atingida</span>
              ) : (
                <span className="text-amber-300">
                  Faltam {formatBRL(savingGoal - totals.balance)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card de avisos inteligentes */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-white">
              Avisos e recomendações
            </h3>
            <p className="text-xs text-zinc-400">
              Análise automática baseada na sua renda, gastos e meta.
            </p>
          </div>
          <div className="text-sm text-zinc-300">
            {topCategory ? (
              <button
                onClick={() => setFilterCategory(topCategory)}
                className="rounded-md bg-white/5 px-2 py-1 text-xs"
                title={`Sugerir cortes na categoria ${topCategory}`}
              >
                Sugerir cortes ({topCategory})
              </button>
            ) : (
              <span className="text-xs text-zinc-500">
                Sem categoria dominante
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-md p-3 ${
                w.level === "critical"
                  ? "bg-rose-900/30 border border-rose-700"
                  : w.level === "warning"
                  ? "bg-amber-900/25 border border-amber-700"
                  : "bg-emerald-900/10 border border-emerald-700/20"
              }`}
            >
              <div className="mt-0.5">
                {w.level === "critical" ? (
                  <span className="text-rose-400">●</span>
                ) : w.level === "warning" ? (
                  <span className="text-amber-300">●</span>
                ) : (
                  <span className="text-emerald-300">●</span>
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{w.title}</div>
                {w.detail && (
                  <div className="text-xs text-zinc-400 mt-1">{w.detail}</div>
                )}
              </div>
            </div>
          ))}
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
                  labels: Object.keys(displayCategoryTotals),
                  datasets: [
                    {
                      data: Object.values(displayCategoryTotals),
                      backgroundColor: palette.slice(
                        0,
                        Object.keys(displayCategoryTotals).length
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
                      data: displayMonthsValues,
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
        {filterCategory && (
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm text-zinc-300">
              Filtro ativo:{" "}
              <span className="font-medium text-white">{filterCategory}</span>
            </div>
            <div>
              <button
                onClick={() => setFilterCategory(null)}
                className="text-xs rounded-md bg-white/5 px-2 py-1"
              >
                Limpar filtro
              </button>
            </div>
          </div>
        )}
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
              {expenses.map((e) => {
                const isActiveFilter = filterCategory !== null;
                const matches = filterCategory
                  ? e.category === filterCategory
                  : true;
                const rowClass = `border-t border-white/5 ${
                  isActiveFilter ? (matches ? "bg-white/5" : "opacity-40") : ""
                }`;
                return (
                  <tr key={e.id} className={rowClass}>
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
                );
              })}
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
