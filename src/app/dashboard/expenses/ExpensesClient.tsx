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
  recurringId?: string;
};

type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  category?: string;
  cadence: "monthly"; // for now only monthly
  paymentDay?: number; // dia do pagamento (1-31)
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

// helper gerador de ids no escopo do módulo (evita chamadas impuras durante o render)
const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function ExpensesClient() {
  const storageKey = "jrcomposto:expenses";
  // normalização de categoria: remove acentos, espaços e mapeia sinônimos para categorias canônicas
  function normalizeCategory(input?: string | null) {
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
  }

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
  const [recurringChecked, setRecurringChecked] = useState(false);
  const [paymentDay, setPaymentDay] = useState<number | string>(() =>
    new Date().getDate()
  );
  const [showConfirmApplyAll, setShowConfirmApplyAll] = useState(false);
  const [showInfoApplyAll, setShowInfoApplyAll] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  // flag para evitar mismatches de hidratação: só mostrar conteúdos dependentes de localStorage
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const expensesRaw = Array.isArray(parsed.expenses) ? parsed.expenses : [];
      return expensesRaw.map((e: Expense) => ({
        ...e,
        category: e.category ? normalizeCategory(e.category) : undefined,
      }));
    } catch {
      return [];
    }
  });

  const [recurringExpenses, setRecurringExpenses] = useState<
    RecurringExpense[]
  >(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const recs = Array.isArray(parsed.recurringExpenses)
        ? parsed.recurringExpenses
        : [];
      return recs.map((r: RecurringExpense) => ({
        ...r,
        category: r.category ? normalizeCategory(r.category) : undefined,
        paymentDay:
          typeof r.paymentDay === "number"
            ? r.paymentDay
            : new Date().getDate(),
      }));
    } catch {
      return [];
    }
  });

  // persist to localStorage whenever income, expenses, savingGoal or recurringExpenses change
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ income, expenses, savingGoal, recurringExpenses })
      );
    } catch {
      // ignore
    }
  }, [income, expenses, savingGoal, recurringExpenses]);

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
        if (Array.isArray(server.recurringExpenses))
          setRecurringExpenses(
            server.recurringExpenses.map((r: RecurringExpense) => ({
              ...r,
              category: r.category ? normalizeCategory(r.category) : undefined,
            }))
          );
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
          body: JSON.stringify({
            income,
            expenses,
            savingGoal,
            recurringExpenses,
          }),
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
  }, [income, expenses, savingGoal, recurringExpenses]);

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v);

  const addExpense = async () => {
    if (isAddingExpense) return;
    setIsAddingExpense(true);
    try {
      const parsed = Number(
        amount
          .toString()
          .replace(/[^0-9.,-]/g, "")
          .replace(",", ".")
      );
      if (!name || !parsed || Number.isNaN(parsed)) return;

      // cria template recorrente quando marcado (persistência do template fica a cargo do sync completo)
      let createdExpense: Expense | null = null;
      if (recurringChecked) {
        const r: RecurringExpense = {
          id: generateId(),
          name: name.trim(),
          amount: parsed,
          category: category.trim()
            ? normalizeCategory(category.trim())
            : undefined,
          cadence: "monthly",
          paymentDay: Math.min(
            Math.max(1, Number(paymentDay || new Date().getDate())),
            31
          ),
        };
        setRecurringExpenses((s) => [r, ...s]);
        const e: Expense = {
          id: generateId(),
          name: name.trim(),
          amount: parsed,
          category: category.trim()
            ? normalizeCategory(category.trim())
            : undefined,
          date: new Date().toISOString(),
          recurringId: r.id,
        };
        setExpenses((s) => [e, ...s]);
        setRecurringChecked(false);
        createdExpense = e;
      } else {
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
        createdExpense = e;
      }

      // tentar persistir o novo lançamento no servidor de forma incremental
      if (createdExpense) {
        try {
          const res = await fetch("/api/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: createdExpense.id,
              name: createdExpense.name,
              amount: createdExpense.amount,
              category: createdExpense.category,
              date: createdExpense.date,
              recurringId: createdExpense.recurringId,
            }),
          });
          if (!res.ok) {
            setSyncStatus("error");
          } else {
            setSyncStatus("saved");
            window.setTimeout(() => setSyncStatus("idle"), 1500);
          }
        } catch {
          setSyncStatus("error");
        }
      }

      setName("");
      setAmount("");
      setCategory("");
    } finally {
      // pequeno timeout para garantir que o usuário veja o feedback visual
      window.setTimeout(() => setIsAddingExpense(false), 150);
    }
  };

  const applyRecurringNow = (id: string) => {
    const r = recurringExpenses.find((x) => x.id === id);
    if (!r) return;
    // calcula a data de ocorrência com base no paymentDay do template
    const now = new Date();
    const preferredDay =
      typeof r.paymentDay === "number" ? r.paymentDay : now.getDate();
    const getCandidate = (ref: Date, day: number) => {
      const y = ref.getFullYear();
      const m = ref.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const d = Math.min(Math.max(1, day), daysInMonth);
      return new Date(y, m, d);
    };
    let candidate = getCandidate(now, preferredDay);
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    if (candidate < todayStart) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      candidate = getCandidate(nextMonth, preferredDay);
    }
    const e: Expense = {
      id: generateId(),
      name: r.name,
      amount: r.amount,
      category: r.category,
      date: candidate.toISOString(),
      recurringId: r.id,
    };
    setExpenses((s) => [e, ...s]);
  };

  const applyAllRecurring = () => {
    const now = new Date();
    const toAdd: Expense[] = [];

    const getCandidate = (ref: Date, day: number) => {
      const y = ref.getFullYear();
      const m = ref.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const d = Math.min(Math.max(1, day), daysInMonth);
      return new Date(y, m, d);
    };

    const sameMonth = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();

    for (const r of recurringExpenses) {
      const preferredDay =
        typeof r.paymentDay === "number" ? r.paymentDay : now.getDate();
      let candidate = getCandidate(now, preferredDay);
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      if (candidate < todayStart) {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        candidate = getCandidate(nextMonth, preferredDay);
      }

      const exists = expenses.some((e) => {
        try {
          const ed = new Date(e.date);
          if (e.recurringId && e.recurringId === r.id)
            return sameMonth(ed, candidate);
          // fallback: match by name+amount in same month
          if (!e.recurringId && e.name === r.name && e.amount === r.amount)
            return sameMonth(ed, candidate);
          return false;
        } catch {
          return false;
        }
      });

      if (!exists) {
        toAdd.push({
          id: generateId(),
          name: r.name,
          amount: r.amount,
          category: r.category,
          date: candidate.toISOString(),
          recurringId: r.id,
        });
      }
    }

    if (toAdd.length > 0) setExpenses((s) => [...toAdd, ...s]);
  };

  const removeRecurring = (id: string) =>
    setRecurringExpenses((s) => s.filter((r) => r.id !== id));

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
    const indexMap: Record<string, number> = {};
    predefinedCategories.forEach((c, i) => (indexMap[c] = i));
    return predefinedCategories.slice().sort((a, b) => {
      const diff = (categoryCounts[b] || 0) - (categoryCounts[a] || 0);
      if (diff !== 0) return diff;
      return (indexMap[a] || 0) - (indexMap[b] || 0);
    });
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
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md max-w-[360px] mx-auto sm:max-w-full">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm sm:text-lg font-medium text-white">
            Gestão de Gastos
          </h2>
          <div className="hidden sm:flex items-center gap-2 text-sm text-zinc-300">
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
              <span className="hidden sm:inline-block whitespace-nowrap">
                {syncStatus === "syncing" && "Sincronizando..."}
                {syncStatus === "saved" && "Salvo"}
                {syncStatus === "error" && "Erro ao salvar"}
                {syncStatus === "idle" && "Sincronizado"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 mb-3">
          <div className="col-span-1 md:col-span-1">
            <label className="mb-1 block text-sm text-zinc-300">
              Renda mensal (R$)
            </label>
            <input
              inputMode="decimal"
              value={income}
              onChange={(e) => setIncome(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-zinc-100 outline-none"
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
              className="w-full rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-zinc-100 outline-none"
            />
          </div>

          <div className="col-span-1 md:col-span-1" />
        </div>

        <div className="mb-4 flex flex-col gap-1 sm:grid sm:grid-cols-4 sm:gap-2">
          <input
            placeholder="Nome do gasto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-zinc-100"
          />
          <input
            placeholder="Valor (R$)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-zinc-100"
          />
          <input
            placeholder="Categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-zinc-100"
          />
          <div className="col-span-4 mt-2 grid grid-cols-2 gap-x-1 gap-y-1 sm:flex sm:flex-wrap sm:gap-2 sm:justify-start min-w-0">
            {sortedPredefined.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`w-full sm:w-auto sm:flex-none min-w-0 inline-flex items-center gap-0.5 text-xs sm:text-sm md:text-base px-0 sm:px-2 py-0.5 sm:py-1 rounded-sm transition-all overflow-hidden max-w-none sm:max-w-40 ${
                  category === c
                    ? "bg-emerald-500 text-white"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`}
              >
                <span className="inline-flex shrink-0 mr-1 px-0.5 sm:px-2 py-0 sm:py-0.5 rounded-full bg-white/10 text-[9px] sm:text-xs text-zinc-200">
                  {isClient ? categoryCounts[c] || 0 : "\u00A0"}
                </span>
                <span className="truncate max-w-[120px] sm:max-w-[140px] min-w-0 text-left text-[9px] sm:text-sm">
                  {c}
                </span>
              </button>
            ))}
          </div>
          <div className="col-span-4 sm:col-span-1 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={recurringChecked}
                onChange={(e) => setRecurringChecked(e.target.checked)}
                className="w-4 h-4 rounded border-white/10 bg-white/5"
              />
              <span>Recorrente (mensal)</span>
            </label>
          </div>
          {recurringChecked && (
            <div className="col-span-4 sm:col-span-1">
              <label className="text-sm text-zinc-300">Dia do pagamento</label>
              <input
                type="number"
                min={1}
                max={31}
                value={paymentDay}
                onChange={(e) =>
                  // allow clearing the input on mobile/desktop by accepting empty string
                  setPaymentDay(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100"
              />
            </div>
          )}
          {/* botão removido daqui — realocado abaixo do resumo */}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-1 sm:gap-2 sm:grid-cols-4">
          <div className="p-2 sm:p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Renda</div>
            <div suppressHydrationWarning className="font-medium text-zinc-100">
              {formatBRL(income)}
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Total gastos</div>
            <div suppressHydrationWarning className="font-medium text-zinc-100">
              {formatBRL(totals.totalExpenses)}
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Saldo</div>
            <div
              suppressHydrationWarning
              className={`font-medium ${
                totals.balance < 0 ? "text-rose-400" : "text-emerald-300"
              }`}
            >
              {formatBRL(totals.balance)}
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-white/3">
            <div className="text-sm text-zinc-300">Meta economia</div>
            <div suppressHydrationWarning className="font-medium text-zinc-100">
              {formatBRL(savingGoal)}
            </div>
            <div className="text-sm mt-1">
              {isClient ? (
                savingGoal <= 0 ? (
                  <span className="text-zinc-400">Defina uma meta</span>
                ) : savingGoal - totals.balance <= 0 ? (
                  <span className="text-emerald-300">Meta atingida</span>
                ) : (
                  <span className="text-amber-300">
                    Faltam {formatBRL(savingGoal - totals.balance)}
                  </span>
                )
              ) : (
                <span className="text-zinc-400">&nbsp;</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-center sm:justify-end">
          <button
            onClick={addExpense}
            disabled={
              isAddingExpense ||
              !name ||
              !amount ||
              Number.isNaN(
                Number(
                  amount
                    .toString()
                    .replace(/[^0-9.,-]/g, "")
                    .replace(",", ".")
                )
              )
            }
            aria-disabled={
              isAddingExpense ||
              !name ||
              !amount ||
              Number.isNaN(
                Number(
                  amount
                    .toString()
                    .replace(/[^0-9.,-]/g, "")
                    .replace(",", ".")
                )
              )
            }
            className={`w-full sm:w-auto rounded-lg px-4 py-2 text-sm font-medium text-white ${
              isAddingExpense
                ? "bg-emerald-600 opacity-90"
                : "bg-emerald-500 hover:bg-emerald-600"
            } disabled:opacity-50`}
          >
            {isAddingExpense ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
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
                <span>Adicionando...</span>
              </span>
            ) : (
              "Adicionar gasto"
            )}
          </button>
        </div>
      </div>

      {showConfirmApplyAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowConfirmApplyAll(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white/5 p-6">
            <h4 className="text-lg font-medium text-white">
              Confirmar aplicação
            </h4>
            <p className="text-sm text-zinc-300 mt-2">
              Isso irá criar {recurringExpenses.length} lançamentos recorrentes.
              Deseja continuar?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmApplyAll(false)}
                className="px-3 py-2 rounded-md bg-white/5 text-sm text-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirmApplyAll(false);
                  applyAllRecurring();
                }}
                className="px-3 py-2 rounded-md bg-emerald-500 text-white text-sm"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfoApplyAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowInfoApplyAll(false)}
          />
          <div className="relative z-10 w-full max-w-2xl rounded-lg bg-white/5 p-6">
            <h4 className="text-lg font-medium text-white">
              Sobre o botão &quot;Aplicar todos&quot;
            </h4>
            <div className="text-sm text-zinc-300 mt-3 space-y-2">
              <p>
                Ao confirmar, o sistema irá criar lançamentos a partir dos
                modelos de despesas recorrentes cadastrados. Cada modelo gera um
                gasto com a data baseada no campo &quot;Dia do pagamento&quot;
                do modelo.
              </p>
              <p>
                Regras principais:
                <ul className="list-disc ml-5 mt-1">
                  <li>
                    Caso a data já tenha passado neste mês, o lançamento será
                    criado para o mês seguinte.
                  </li>
                  <li>
                    O sistema tenta evitar duplicatas — ele checa se já existe
                    um lançamento vinculado ao mesmo modelo para o mesmo mês.
                    Haverá também uma verificação de fallback por nome + valor.
                  </li>
                  <li>
                    As instâncias criadas ficam ligadas ao modelo via
                    `recurringId` para facilitar rastreabilidade e futuras
                    operações (remoção/edição).
                  </li>
                </ul>
              </p>
              <p>
                As novas entradas são salvas localmente e sincronizadas com o
                servidor automaticamente.
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowInfoApplyAll(false)}
                className="px-3 py-2 rounded-md bg-emerald-500 text-white text-sm"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card de despesas recorrentes */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white">
              Despesas recorrentes
            </h3>
            <p className="text-xs text-zinc-400">
              Modelos mensais que você pode aplicar quando quiser.
            </p>
          </div>
          <div />
        </div>

        {/* toolbar: ações globais para recorrentes */}
        <div className="mt-2 mb-3 flex items-center justify-end gap-2">
          <button
            onClick={() => setShowConfirmApplyAll(true)}
            disabled={recurringExpenses.length === 0}
            className="text-xs rounded-md bg-emerald-500 px-2 py-1 text-white disabled:opacity-40"
          >
            Aplicar todos
          </button>
          <button
            aria-label="O que faz Aplicar todos"
            onClick={() => setShowInfoApplyAll(true)}
            className="text-xs rounded-full bg-white/6 px-2 py-1 text-zinc-200"
          >
            i
          </button>
        </div>

        <div className="grid gap-2">
          {recurringExpenses.length === 0 ? (
            <div className="text-sm text-zinc-400">
              Nenhuma despesa recorrente cadastrada.
            </div>
          ) : (
            recurringExpenses.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md p-3 bg-white/3"
              >
                <div>
                  <div className="text-sm text-white">
                    {r.name} — {r.category ?? "-"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {formatBRL(r.amount)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => applyRecurringNow(r.id)}
                    className="text-xs rounded-md bg-emerald-500 px-2 py-1 text-white"
                  >
                    Aplicar agora
                  </button>
                  <button
                    onClick={() => removeRecurring(r.id)}
                    className="text-xs rounded-md bg-rose-600 px-2 py-1 text-white"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))
          )}
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
          {isClient ? (
            warnings.map((w, i) => (
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
                  <div className="text-sm font-medium text-white">
                    {w.title}
                  </div>
                  {w.detail && (
                    <div className="text-xs text-zinc-400 mt-1">{w.detail}</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-400">
              Carregando recomendações...
            </div>
          )}
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
