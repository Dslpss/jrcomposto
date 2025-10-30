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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

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

export function DashboardClient({ userEmail }: { userEmail: string }) {
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [msg, setMsg] = useState<string | null>(null);

	// múltiplos cenários
	const [scenarios, setScenarios] = useState<Scenario[]>([]);
	const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);

	// campos do cenário ativo
	const active = useMemo(() => scenarios.find(s => s.id === currentScenarioId) ?? null, [scenarios, currentScenarioId]);
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
					const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
					const one: Scenario = {
						id,
						name: "Meu cenário",
						principal: d.principal != null ? String(d.principal) : "10",
						taxaPercentDia: d.taxaPercentDia != null ? String(d.taxaPercentDia) : "10",
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
				setCurrentScenarioId(d.currentScenarioId ?? list[0]?.id ?? null);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	function updateActive(patch: Partial<Scenario>) {
		if (!active) return;
		setScenarios(prev => prev.map(s => s.id === active.id ? { ...s, ...patch } : s));
	}

	const parsed = useMemo(() => {
		const principalNum = Number.parseFloat(principal.replace(",", ".")) || 0;
		const taxa = (Number.parseFloat(taxaPercentDia.replace(",", ".")) || 0) / 100;
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
		const saldoFinal = cronograma.length ? cronograma[cronograma.length - 1].saldoFinal : parsed.principal;
		return { totalAportes, totalJuros, saldoFinal } as const;
	}, [cronograma, parsed.principal]);

	// Dados para gráficos
	const chartLabels = useMemo(() => cronograma.map((c) => `Dia ${c.dia}`), [cronograma]);
	const lineData = useMemo(() => ({
		labels: chartLabels,
		datasets: [
			{
				label: "Saldo final",
				data: cronograma.map(c => c.saldoFinal),
				borderColor: "#34d399",
				backgroundColor: "rgba(52, 211, 153, 0.2)",
				fill: true,
				tension: 0.25,
				pointRadius: 0,
			},
		],
	}), [chartLabels, cronograma]);

	const barData = useMemo(() => ({
		labels: chartLabels,
		datasets: [
			{
				label: "Juros do dia",
				data: cronograma.map(c => c.jurosDoDia),
				backgroundColor: "rgba(6, 182, 212, 0.5)",
			},
		],
	}), [chartLabels, cronograma]);

	const chartOptions = {
		responsive: true,
		plugins: { legend: { labels: { color: "#e5e7eb" } } },
		scales: {
			x: { ticks: { color: "#d1d5db" }, grid: { color: "rgba(255,255,255,0.08)" } },
			y: { ticks: { color: "#d1d5db" }, grid: { color: "rgba(255,255,255,0.08)" } },
		},
	} as const;

	async function persistAll(next?: { scenarios?: Scenario[]; currentScenarioId?: string | null }) {
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
			const nextList = scenarios.map(s => s.id === active.id ? updated : s);
			await persistAll({ scenarios: nextList });
			setScenarios(nextList);
			setMsg("Cenário salvo!");
		} catch (e: any) {
			setMsg(e?.message || "Erro");
		} finally {
			setSaving(false);
		}
	}

	async function handleNew() {
		const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
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
		} catch (e: any) {
			setMsg(e?.message || "Erro");
		}
	}

	async function handleDelete() {
		if (!active) return;
		const nextList = scenarios.filter(s => s.id !== active.id);
		const nextId = nextList[0]?.id ?? null;
		setScenarios(nextList);
		setCurrentScenarioId(nextId);
		try {
			await persistAll({ scenarios: nextList, currentScenarioId: nextId });
			setMsg("Cenário removido");
		} catch (e: any) {
			setMsg(e?.message || "Erro");
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
		doc.text(`Usuário: ${userEmail}`, margin, 60);
		doc.text(`Parâmetros: Valor Inicial ${formatBRL(parsed.principal)} | Taxa ${(parsed.taxa*100).toLocaleString("pt-BR")} % a.d. | Dias ${parsed.dias} | Aporte diário ${formatBRL(parsed.aporte)}`, margin, 80, { maxWidth: 515 });
		doc.text(`Resumo: Juros ${formatBRL(totais.totalJuros)} | Aportes ${formatBRL(totais.totalAportes)} | Saldo Final ${formatBRL(totais.saldoFinal)}`, margin, 98, { maxWidth: 515 });

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
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800">
			{/* Blobs decorativos */}
			<div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
			<div className="pointer-events-none absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
			<div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

			<div className="relative mx-auto max-w-6xl p-6 md:p-10">
				<div className="mb-6 flex items-center justify-between">
					<h1 className="text-xl font-semibold text-white">Dashboard</h1>
					<div className="flex items-center gap-3">
						<span className="text-sm text-zinc-300">{userEmail}</span>
						<button onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10">Sair</button>
					</div>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
					<div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
						<div className="flex-1">
							<label className="mb-1 block text-sm text-zinc-300">Cenário</label>
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
								{scenarios.map(s => (
									<option key={s.id} value={s.id} className="bg-zinc-900">{s.name}</option>
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
						<div className="flex gap-2">
							<button onClick={handleNew} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10">Novo</button>
							<button onClick={handleDelete} disabled={!active} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 backdrop-blur transition hover:bg-white/10 disabled:opacity-60">Excluir</button>
							<button onClick={exportPdf} className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-3 py-2 text-sm font-medium text-white shadow-lg transition hover:brightness-110">Exportar PDF</button>
						</div>
					</div>
				</div>

				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
						<h2 className="mb-4 text-lg font-medium text-white">Cenário de Juros</h2>
						{loading ? (
							<p className="text-sm text-zinc-300">Carregando...</p>
						) : (
							<div className="grid grid-cols-2 gap-4">
								<div className="col-span-2">
									<label className="mb-1 block text-sm text-zinc-300">Valor Inicial (R$)</label>
									<input className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20" inputMode="decimal" value={principal} onChange={(e) => updateActive({ principal: e.target.value })} />
								</div>
								<div>
									<label className="mb-1 block text-sm text-zinc-300">Taxa ao dia (%)</label>
									<input className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20" inputMode="decimal" value={taxaPercentDia} onChange={(e) => updateActive({ taxaPercentDia: e.target.value })} />
								</div>
								<div>
									<label className="mb-1 block text-sm text-zinc-300">Dias</label>
									<input className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20" inputMode="numeric" value={dias} onChange={(e) => updateActive({ dias: e.target.value })} />
								</div>
								<div className="col-span-2">
									<label className="mb-1 block text-sm text-zinc-300">Aporte diário (opcional)</label>
									<input className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20" inputMode="decimal" value={aporteDiario} onChange={(e) => updateActive({ aporteDiario: e.target.value })} />
								</div>
								<div className="col-span-2 mt-2 flex items-center gap-3">
									<button disabled={saving || !active} onClick={handleSave} className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-3 py-2 text-sm font-medium text-white shadow-lg transition enabled:hover:brightness-110 disabled:opacity-60">
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
						<dl className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<dt className="text-zinc-300">Valor inicial</dt>
								<dd className="font-medium text-zinc-100">{formatBRL(parsed.principal)}</dd>
							</div>
							<div>
								<dt className="text-zinc-300">Taxa ao dia</dt>
								<dd className="font-medium text-zinc-100">{(parsed.taxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}%</dd>
							</div>
							<div>
								<dt className="text-zinc-300">Dias</dt>
								<dd className="font-medium text-zinc-100">{parsed.dias}</dd>
							</div>
							<div>
								<dt className="text-zinc-300">Total aportes</dt>
								<dd className="font-medium text-zinc-100">{formatBRL(totais.totalAportes)}</dd>
							</div>
							<div>
								<dt className="text-zinc-300">Total em juros</dt>
								<dd className="font-medium text-zinc-100">{formatBRL(totais.totalJuros)}</dd>
							</div>
							<div>
								<dt className="text-zinc-300">Saldo final</dt>
								<dd className="font-semibold text-emerald-300">{formatBRL(totais.saldoFinal)}</dd>
							</div>
						</dl>
					</div>
				</div>

				{/* Gráficos */}
				<div className="mt-6 grid gap-4 md:grid-cols-2">
					<div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
						<h2 className="mb-4 text-lg font-medium text-white">Evolução do saldo</h2>
						<div className="h-64">
							<Line data={lineData} options={chartOptions} />
						</div>
					</div>
					<div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
						<h2 className="mb-4 text-lg font-medium text-white">Juros por dia</h2>
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
									<th className="px-4 py-3">Dia</th>
									<th className="px-4 py-3">Saldo inicial</th>
									<th className="px-4 py-3">Aporte</th>
									<th className="px-4 py-3">Juros do dia</th>
									<th className="px-4 py-3">Saldo final</th>
								</tr>
							</thead>
							<tbody>
								{cronograma.map((linha) => (
									<tr key={linha.dia} className="border-t border-white/10 text-sm">
										<td className="px-4 py-3 text-zinc-300">{linha.dia}</td>
										<td className="px-4 py-3 text-zinc-100">{formatBRL(linha.saldoInicial)}</td>
										<td className="px-4 py-3 text-zinc-100">{formatBRL(linha.aporte)}</td>
										<td className="px-4 py-3 text-emerald-300">{formatBRL(linha.jurosDoDia)}</td>
										<td className="px-4 py-3 font-medium text-zinc-100">{formatBRL(linha.saldoFinal)}</td>
									</tr>
								))}
								{cronograma.length === 0 && (
									<tr>
										<td className="px-4 py-6 text-center text-sm text-zinc-400" colSpan={5}>Ajuste os parâmetros para ver o cronograma.</td>
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
