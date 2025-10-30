"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

type Scenario = {
  id: string;
  name: string;
  principal: string; // manter como string para UI
  taxaPercentDia: string;
  dias: string;
  aporteDiario: string;
  updatedAt?: string;
};

type DiaJuros = {
  dia: number;
  saldoInicial: number;
  aporte: number;
  jurosDoDia: number;
  saldoFinal: number;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

export function DashboardClient({ userName }: { userName: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // múltiplos cenários
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(
    null
  );

  // campos do cenário ativo
  const active = useMemo(
    () => scenarios.find((s) => s.id === currentScenarioId) ?? null,
    [scenarios, currentScenarioId]
  );
  const principal = active?.principal ?? "10";
  const taxaPercentDia = active?.taxaPercentDia ?? "10";
  const dias = active?.dias ?? "7";
  const aporteDiario = active?.aporteDiario ?? "0";

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/user-data");
        const json = await res.json();
        const d = json?.data ?? {};
        // Migração: se vier formato antigo (campos soltos), cria 1 cenário padrão
        if (!d.scenarios) {
          const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
          const one: Scenario = {
            id,
            name: "Meu cenário",
            principal: d.principal != null ? String(d.principal) : "10",
            taxaPercentDia:
              d.taxaPercentDia != null ? String(d.taxaPercentDia) : "10",
            dias: d.dias != null ? String(d.dias) : "7",
            aporteDiario: d.aporteDiario != null ? String(d.aporteDiario) : "0",
            updatedAt: new Date().toISOString(),
          };
          setScenarios([one]);
          setCurrentScenarioId(id);
          return;
        }
        const list: Scenario[] = Array.isArray(d.scenarios) ? d.scenarios : [];
        setScenarios(list);
        const chosenId = d.currentScenarioId ?? list[0]?.id ?? null;
        setCurrentScenarioId(chosenId);
        // se o backend trouxe um mapa de dias concluídos, armazena-o e aplica para o cenário atual
        if (d.completedDays && typeof d.completedDays === "object") {
          try {
            setServerCompletedMap(d.completedDays as Record<string, number[]>);
            if (chosenId && Array.isArray(d.completedDays[chosenId])) {
              setCompletedDays(new Set(d.completedDays[chosenId] || []));
            }
          } catch {
            // ignore formato inesperado
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateActive(patch: Partial<Scenario>) {
    if (!active) return;
    setScenarios((prev) =>
      prev.map((s) => (s.id === active.id ? { ...s, ...patch } : s))
    );
  }

  const parsed = useMemo(() => {
    const principalNum = Number.parseFloat(principal.replace(",", ".")) || 0;
    const taxa =
      (Number.parseFloat(taxaPercentDia.replace(",", ".")) || 0) / 100;
    const diasNum = Math.max(0, Math.floor(Number(dias) || 0));
    const aporte = Number.parseFloat(aporteDiario.replace(",", ".")) || 0;
    return { principal: principalNum, taxa, dias: diasNum, aporte } as const;
  }, [principal, taxaPercentDia, dias, aporteDiario]);

  const cronograma: DiaJuros[] = useMemo(() => {
    const linhas: DiaJuros[] = [];
    if (parsed.dias <= 0) return linhas;
    let saldo = parsed.principal;
    for (let d = 1; d <= parsed.dias; d++) {
      const saldoInicial = saldo;
      const aporte = parsed.aporte;
      const baseParaJuros = saldoInicial + aporte;
      const jurosDoDia = baseParaJuros * parsed.taxa;
      const saldoFinal = baseParaJuros + jurosDoDia;
      linhas.push({ dia: d, saldoInicial, aporte, jurosDoDia, saldoFinal });
      saldo = saldoFinal;
    }
    return linhas;
  }, [parsed]);

  const totais = useMemo(() => {
    const totalAportes = cronograma.reduce((acc, it) => acc + it.aporte, 0);
    const totalJuros = cronograma.reduce((acc, it) => acc + it.jurosDoDia, 0);
    const saldoFinal = cronograma.length
      ? cronograma[cronograma.length - 1].saldoFinal
      : parsed.principal;
    return { totalAportes, totalJuros, saldoFinal } as const;
  }, [cronograma, parsed.principal]);

  // --- Meta/Objetivo: calcular taxa diária necessária para atingir uma meta em N dias ---
  const [metaValor, setMetaValor] = useState<string>("");
  const [metaDias, setMetaDias] = useState<string>("");
  const [taxaRequerida, setTaxaRequerida] = useState<number | null>(null);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);

  // iniciais do usuário para o avatar no header
  const initials = useMemo(() => {
    if (!userName) return "";
    const parts = userName.trim().split(/\s+/);
    const a = parts[0]?.charAt(0) ?? "";
    const b = parts[1]?.charAt(0) ?? "";
    return (a + b).toUpperCase();
  }, [userName]);

  // Dias concluídos (Set de números) - persistido por cenário em localStorage
  const [completedDays, setCompletedDays] = useState<Set<number>>(new Set());
  // mapa (server) scenarioId -> array de dias concluídos, carregado do backend
  const [serverCompletedMap, setServerCompletedMap] = useState<
    Record<string, number[]>
  >({});

  function simulateFinal(
    principalNum: number,
    aporteNum: number,
    diasNum: number,
    taxaDecimal: number
  ) {
    let saldo = principalNum;
    for (let d = 1; d <= diasNum; d++) {
      const saldoInicial = saldo;
      const aporte = aporteNum;
      const baseParaJuros = saldoInicial + aporte;
      const jurosDoDia = baseParaJuros * taxaDecimal;
      const saldoFinal = baseParaJuros + jurosDoDia;
      saldo = saldoFinal;
    }
    return saldo;
  }

  // Ao mudar de cenário, prefere dados do servidor (serverCompletedMap) se disponíveis;
  // caso contrário, faz fallback para localStorage.
  useEffect(() => {
    if (!currentScenarioId) {
      setCompletedDays(new Set());
      return;
    }
    const fromServer = serverCompletedMap[currentScenarioId];
    if (Array.isArray(fromServer)) {
      setCompletedDays(new Set(fromServer));
      return;
    }
    try {
      const raw = localStorage.getItem(`completed:${currentScenarioId}`);
      if (!raw) {
        setCompletedDays(new Set());
        return;
      }
      const arr = JSON.parse(raw) as number[];
      setCompletedDays(new Set(arr || []));
    } catch {
      setCompletedDays(new Set());
    }
  }, [currentScenarioId, serverCompletedMap]);

  function persistCompleted(nextSet: Set<number>) {
    if (!currentScenarioId) return;
    const arr = Array.from(nextSet.values());
    try {
      localStorage.setItem(
        `completed:${currentScenarioId}`,
        JSON.stringify(arr)
      );
    } catch {
      // ignore
    }
  }

  // Persiste os dias concluídos no backend (usa o mesmo contrato de /api/user-data)
  async function persistCompletedServer(nextSet: Set<number>) {
    if (!currentScenarioId) return;
    const arr = Array.from(nextSet.values());
    const payload = {
      scenarios,
      currentScenarioId,
      // adiciona um campo 'completedDays' no objeto data armazenado no usuário
      completedDays: { [currentScenarioId]: arr },
    };
    try {
      // fire-and-forget, não bloqueia a UI; mas captura falhas silenciosamente
      const res = await fetch("/api/user-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // atualiza o mapa local do servidor para refletir a mudança imediatamente
        setServerCompletedMap((prev) => ({
          ...prev,
          [currentScenarioId]: arr,
        }));
      }
    } catch {
      // não interrompe a UX se falhar
    }
  }

  function toggleDay(dia: number) {
    setCompletedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      persistCompleted(next);
      void persistCompletedServer(next);
      return next;
    });
  }

  function toggleAll() {
    setCompletedDays((prev) => {
      const next = new Set(prev);
      const all = cronograma.map((c) => c.dia);
      const allMarked = all.every((d) => next.has(d));
      if (allMarked) {
        // limpar
        next.clear();
      } else {
        all.forEach((d) => next.add(d));
      }
      persistCompleted(next);
      void persistCompletedServer(next);
      return next;
    });
  }

  /**
   * Converte uma string de entrada de moeda/numero para number.
   * Aceita formatos como:
   * - "1000.50"
   * - "1.000,50"
   * - "R$ 1.000,50"
   * - "1000,50"
   */
  function parseBRLToNumber(input: string | undefined): number {
    if (!input) return 0;
    let s = String(input).trim();
    // remover prefixos/símbolos (R$, espaços)
    s = s.replace(/[^0-9.,-]/g, "");
    // se contém '.' e ',' tratar '.' como separador de milhares
    if (s.indexOf(".") !== -1 && s.indexOf(",") !== -1) {
      s = s.replace(/\./g, ""); // remove milhares
      s = s.replace(/,/g, "."); // transforma decimal
    } else {
      // se contém apenas vírgula, usa como decimal
      if (s.indexOf(",") !== -1 && s.indexOf(".") === -1) {
        s = s.replace(/,/g, ".");
      }
      // caso só tenha pontos, assume ponto decimal ou milhares (parseFloat lidará)
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  /** Formata valor de entrada como moeda BRL enquanto o usuário digita.
   * Estratégia: interpretar todos os dígitos como centavos e formatar com Intl.
   * Ex.: entrada '1234' -> '12,34' exibido como '12,34' ou 'R$ 12,34' dependendo do formatter.
   */
  function formatCurrencyInput(raw: string): string {
    const s = String(raw).trim();
    if (!s) return "";
    // se o usuário digitou separador decimal (',' ou '.') consideramos que ele está informando decimais
    if (/[,\.]/.test(s)) {
      const n = parseBRLToNumber(s);
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    }
    // caso contrário, trata como número inteiro (unidades) e adiciona centavos .00
    const digits = s.replace(/\D/g, "");
    if (!digits) return "";
    const n = parseInt(digits, 10);
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  function findRequiredDailyRate(
    goal: number,
    principalNum: number,
    aporteNum: number,
    diasNum: number
  ) {
    if (diasNum <= 0) return null;
    if (goal <= principalNum) return 0; // já alcançado

    // busca binária no espaço da taxa diária (decimal). taxa pode ser negativa, mas não menor que -0.9999
    let low = -0.9999;
    let high = 10; // 1000% ao dia como limite superior razoável

    // se mesmo com high não alcança, retorna null
    const finalHigh = simulateFinal(principalNum, aporteNum, diasNum, high);
    if (finalHigh < goal) return null;

    for (let i = 0; i < 80; i++) {
      const mid = (low + high) / 2;
      const val = simulateFinal(principalNum, aporteNum, diasNum, mid);
      if (val < goal) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  // Dados para gráficos
  const chartLabels = useMemo(
    () => cronograma.map((c) => `Dia ${c.dia}`),
    [cronograma]
  );
  const lineData = useMemo(
    () => ({
      labels: chartLabels,
      datasets: [
        {
          label: "Saldo final",
          data: cronograma.map((c) => c.saldoFinal),
          borderColor: "#34d399",
          backgroundColor: "rgba(52, 211, 153, 0.2)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    }),
    [chartLabels, cronograma]
  );

  const barData = useMemo(
    () => ({
      labels: chartLabels,
      datasets: [
        {
          label: "Juros do dia",
          data: cronograma.map((c) => c.jurosDoDia),
          backgroundColor: "rgba(6, 182, 212, 0.5)",
        },
      ],
    }),
    [chartLabels, cronograma]
  );

  const chartOptions = {
    responsive: true,
    plugins: { legend: { labels: { color: "#e5e7eb" } } },
    scales: {
      x: {
        ticks: { color: "#d1d5db" },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
      y: {
        ticks: { color: "#d1d5db" },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
    },
  } as const;

  function handleCalcularMeta() {
    setMetaMsg(null);
    setTaxaRequerida(null);

    const goal = parseBRLToNumber(metaValor) || 0;
    const diasMeta = metaDias
      ? Math.max(0, Math.floor(Number((metaDias || "").replace(",", ".") || 0)))
      : parsed.dias;
    const principalNum = parsed.principal;
    const aporteNum = parsed.aporte;

    if (!goal || diasMeta <= 0) {
      setMetaMsg("Informe um valor de meta válido e dias (>0)");
      return;
    }

    const found = findRequiredDailyRate(
      goal,
      principalNum,
      aporteNum,
      diasMeta
    );
    if (found === null) {
      setMetaMsg("Não é possível atingir essa meta com taxa ≤ 1000% a.d.");
      return;
    }
    setTaxaRequerida(found);
  }

  async function persistAll(next?: {
    scenarios?: Scenario[];
    currentScenarioId?: string | null;
  }) {
    const payload = {
      scenarios: next?.scenarios ?? scenarios,
      currentScenarioId: next?.currentScenarioId ?? currentScenarioId,
    };
    const res = await fetch("/api/user-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Falha ao salvar");
  }

  async function handleSave() {
    if (!active) return;
    setMsg(null);
    setSaving(true);
    try {
      const updated: Scenario = {
        ...active,
        principal,
        taxaPercentDia,
        dias,
        aporteDiario,
        updatedAt: new Date().toISOString(),
      };
      const nextList = scenarios.map((s) => (s.id === active.id ? updated : s));
      await persistAll({ scenarios: nextList });
      setScenarios(nextList);
      setMsg("Cenário salvo!");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function handleNew() {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const novo: Scenario = {
      id,
      name: `Cenário ${scenarios.length + 1}`,
      principal: "10",
      taxaPercentDia: "10",
      dias: "7",
      aporteDiario: "0",
      updatedAt: new Date().toISOString(),
    };
    const nextList = [...scenarios, novo];
    setScenarios(nextList);
    setCurrentScenarioId(id);
    try {
      await persistAll({ scenarios: nextList, currentScenarioId: id });
      setMsg("Novo cenário criado");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(message || "Erro");
    }
  }

  async function handleDelete() {
    if (!active) return;
    const nextList = scenarios.filter((s) => s.id !== active.id);
    const nextId = nextList[0]?.id ?? null;
    setScenarios(nextList);
    setCurrentScenarioId(nextId);
    try {
      await persistAll({ scenarios: nextList, currentScenarioId: nextId });
      setMsg("Cenário removido");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(message || "Erro");
    }
  }

  function exportPdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const title = `Relatório de Juros Compostos - ${active?.name ?? "Cenário"}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, margin, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Usuário: ${userName}`, margin, 60);
    doc.text(
      `Parâmetros: Valor Inicial ${formatBRL(parsed.principal)} | Taxa ${(
        parsed.taxa * 100
      ).toLocaleString("pt-BR")} % a.d. | Dias ${
        parsed.dias
      } | Aporte diário ${formatBRL(parsed.aporte)}`,
      margin,
      80,
      { maxWidth: 515 }
    );
    doc.text(
      `Resumo: Juros ${formatBRL(totais.totalJuros)} | Aportes ${formatBRL(
        totais.totalAportes
      )} | Saldo Final ${formatBRL(totais.saldoFinal)}`,
      margin,
      98,
      { maxWidth: 515 }
    );

    const rows = cronograma.map((c) => [
      c.dia,
      formatBRL(c.saldoInicial),
      formatBRL(c.aporte),
      formatBRL(c.jurosDoDia),
      formatBRL(c.saldoFinal),
    ]);
    autoTable(doc, {
      startY: 120,
      head: [["Dia", "Saldo inicial", "Aporte", "Juros do dia", "Saldo final"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [24, 24, 27] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin },
    });

    doc.save(`relatorio-juros-${Date.now()}.pdf`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-zinc-950 via-zinc-900 to-zinc-800">
      {/* Blobs decorativos */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl p-6 md:p-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold bg-linear-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]">
              Dashboard
            </h1>
            <span className="hidden sm:inline text-sm text-zinc-400">
              Gerencie seus cenários
            </span>
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

              {/* botão visível apenas em telas pequenas */}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="sm:hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10 shrink-0"
              >
                Sair
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-zinc-300">
                Cenário
              </label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                value={currentScenarioId ?? ""}
                onChange={async (e) => {
                  const id = e.target.value || null;
                  setCurrentScenarioId(id);
                  try {
                    await persistAll({ currentScenarioId: id });
                  } catch {}
                }}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-900">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-zinc-300">Nome</label>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                value={active?.name ?? ""}
                onChange={(e) => updateActive({ name: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleNew}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10"
              >
                Novo
              </button>
              <button
                onClick={handleDelete}
                disabled={!active}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10 disabled:opacity-60"
              >
                Excluir
              </button>
              <button
                onClick={exportPdf}
                className="group relative overflow-hidden rounded-lg bg-linear-to-br from-emerald-500 to-cyan-500 px-3 py-2 text-sm font-medium text-white shadow-lg transition hover:brightness-110"
              >
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
            <h2 className="mb-4 text-lg font-medium text-white">
              Cenário de Juros
            </h2>
            {loading ? (
              <p className="text-sm text-zinc-300">Carregando...</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm text-zinc-300">
                    Valor Inicial (R$)
                  </label>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                    inputMode="decimal"
                    value={principal}
                    onChange={(e) =>
                      updateActive({ principal: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">
                    Taxa ao dia (%)
                  </label>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                    inputMode="decimal"
                    value={taxaPercentDia}
                    onChange={(e) =>
                      updateActive({ taxaPercentDia: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-zinc-300">
                    Dias
                  </label>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                    inputMode="numeric"
                    value={dias}
                    onChange={(e) => updateActive({ dias: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm text-zinc-300">
                    Aporte diário (opcional)
                  </label>
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                    inputMode="decimal"
                    value={aporteDiario}
                    onChange={(e) =>
                      updateActive({ aporteDiario: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-2 mt-2 flex flex-wrap items-center gap-3">
                  <button
                    disabled={saving || !active}
                    onClick={handleSave}
                    className="group relative overflow-hidden rounded-lg bg-linear-to-br from-emerald-500 to-cyan-500 px-3 py-2 text-sm font-medium text-white shadow-lg transition enabled:hover:brightness-110 disabled:opacity-60"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-white/20 transition group-hover:translate-x-0" />
                    {saving ? "Salvando..." : "Salvar cenário"}
                  </button>
                  {msg && <span className="text-sm text-zinc-300">{msg}</span>}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
            <h2 className="mb-4 text-lg font-medium text-white">Resumo</h2>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-300">Valor inicial</dt>
                <dd className="font-medium text-zinc-100">
                  {formatBRL(parsed.principal)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300">Taxa ao dia</dt>
                <dd className="font-medium text-zinc-100">
                  {(parsed.taxa * 100).toLocaleString("pt-BR", {
                    maximumFractionDigits: 6,
                  })}
                  %
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300">Dias</dt>
                <dd className="font-medium text-zinc-100">{parsed.dias}</dd>
              </div>
              <div>
                <dt className="text-zinc-300">Total aportes</dt>
                <dd className="font-medium text-zinc-100">
                  {formatBRL(totais.totalAportes)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300">Total em juros</dt>
                <dd className="font-medium text-zinc-100">
                  {formatBRL(totais.totalJuros)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-300">Saldo final</dt>
                <dd className="font-semibold text-emerald-300">
                  {formatBRL(totais.saldoFinal)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md planejador-meta">
          <h2 className="mb-4 text-lg font-medium text-white">
            Planejador de Meta
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="col-span-1 md:col-span-1">
              <label className="mb-1 block text-sm text-zinc-300">
                Meta (R$)
              </label>
              <input
                inputMode="numeric"
                value={metaValor}
                onChange={(e) => setMetaValor(e.target.value)}
                onBlur={() => setMetaValor(formatCurrencyInput(metaValor))}
                onFocus={() => {
                  // ao focar, converte para formato editável (número simples)
                  const n = parseBRLToNumber(metaValor);
                  setMetaValor(n ? String(n) : "");
                }}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                placeholder={formatBRL(totais.saldoFinal)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-300">
                Dias para a meta
              </label>
              <input
                inputMode="numeric"
                value={metaDias}
                onChange={(e) => setMetaDias(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                placeholder={String(parsed.dias)}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleCalcularMeta}
                className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white shadow transition hover:brightness-105"
              >
                Calcular taxas
              </button>
            </div>
            <div className="col-span-3 mt-2">
              {metaMsg && <p className="text-sm text-rose-400">{metaMsg}</p>}
              {taxaRequerida !== null && (
                <div>
                  <p className="text-sm text-zinc-300">
                    Taxa diária necessária aproximada:
                  </p>
                  <p className="mb-2 text-lg font-semibold text-emerald-300">
                    {(taxaRequerida * 100).toLocaleString("pt-BR", {
                      maximumFractionDigits: 4,
                    })}
                    % a.d.
                  </p>
                  <div className="overflow-auto rounded-md border border-white/5 bg-white/3 p-2">
                    <table className="w-full text-sm">
                      <thead className="text-zinc-300 text-left">
                        <tr>
                          <th className="px-2 py-1">Variação</th>
                          <th className="px-2 py-1">Taxa (a.d.)</th>
                          <th className="px-2 py-1">Saldo final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[-2, -1, 0, 1, 2].map((off) => {
                          const r = taxaRequerida + off / 100;
                          const diasMetaNum = metaDias
                            ? Math.max(
                                0,
                                Math.floor(
                                  Number(
                                    (metaDias || "").replace(",", ".") || 0
                                  )
                                )
                              )
                            : parsed.dias;
                          const finalVal = simulateFinal(
                            parsed.principal,
                            parsed.aporte,
                            diasMetaNum,
                            r
                          );
                          return (
                            <tr key={off} className="border-t border-white/5">
                              <td className="px-2 py-1 text-zinc-300">
                                {off >= 0 ? `+${off}%` : `${off}%`}
                              </td>
                              <td className="px-2 py-1 font-medium text-zinc-100">
                                {(r * 100).toLocaleString("pt-BR", {
                                  maximumFractionDigits: 4,
                                })}
                                %
                              </td>
                              <td className="px-2 py-1 font-semibold text-emerald-300">
                                {formatBRL(finalVal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gráficos */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
            <h2 className="mb-4 text-lg font-medium text-white">
              Evolução do saldo
            </h2>
            <div className="h-64">
              <Line data={lineData} options={chartOptions} />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
            <h2 className="mb-4 text-lg font-medium text-white">
              Juros por dia
            </h2>
            <div className="h-64">
              <Bar data={barData} options={chartOptions} />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
          <div className="overflow-auto max-h-[60vh]">
            <table className="min-w-full table-auto">
              <thead className="sticky top-0 z-10 bg-white/10 backdrop-blur text-left text-sm text-zinc-200">
                <tr>
                  <th className="px-4 py-3">
                    <button
                      onClick={toggleAll}
                      title="Marcar/Desmarcar todos"
                      className="rounded px-2 py-1 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <span className="mr-2">Concluído</span>
                      {cronograma.length > 0 && (
                        <span className="inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-200">
                          {completedDays.size}/{cronograma.length}
                        </span>
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3">Dia</th>
                  <th className="px-4 py-3">Saldo inicial</th>
                  <th className="px-4 py-3">Aporte</th>
                  <th className="px-4 py-3">Juros do dia</th>
                  <th className="px-4 py-3">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {cronograma.map((linha) => {
                  const isDone = completedDays.has(linha.dia);
                  return (
                    <tr
                      key={linha.dia}
                      className={`border-t border-white/10 text-sm ${
                        isDone ? "opacity-60 line-through" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-zinc-300">
                        <input
                          aria-label={`Marcar dia ${linha.dia} como concluído`}
                          type="checkbox"
                          checked={isDone}
                          onChange={() => toggleDay(linha.dia)}
                          className="h-4 w-4 rounded border-white/10 text-emerald-400"
                        />
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{linha.dia}</td>
                      <td className="px-4 py-3 text-zinc-100">
                        {formatBRL(linha.saldoInicial)}
                      </td>
                      <td className="px-4 py-3 text-zinc-100">
                        {formatBRL(linha.aporte)}
                      </td>
                      <td className="px-4 py-3 text-emerald-300">
                        {formatBRL(linha.jurosDoDia)}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-100">
                        {formatBRL(linha.saldoFinal)}
                      </td>
                    </tr>
                  );
                })}
                {cronograma.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-sm text-zinc-400"
                      colSpan={6}
                    >
                      Ajuste os parâmetros para ver o cronograma.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
