"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [ok, setOk] = useState(false);
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("/api/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password, name }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || "Erro ao cadastrar");
			setOk(true);
		} catch (err: any) {
			setError(err?.message || "Erro");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800">
			{/* Blobs decorativos */}
			<div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
			<div className="pointer-events-none absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
			<div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

			<div className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 px-6 py-10 md:grid-cols-2 md:gap-10 md:px-10 md:py-16">
				{/* Lado de branding */}
				<div className="order-2 hidden flex-col justify-center md:order-1 md:flex">
					<div className="space-y-4">
						<span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 backdrop-blur">
							<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
							Crie sua conta
						</span>
						<h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
							Simule, salve e gerencie seus cenários
						</h1>
						<p className="max-w-md text-zinc-300">
							Cadastre-se para começar a salvar múltiplos cenários de juros compostos, acessíveis em qualquer lugar.
						</p>
					</div>
				</div>

				{/* Card de cadastro */}
				<div className="order-1 flex items-center justify-center md:order-2">
					<form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md md:p-8">
						<div className="mb-6">
							<div className="flex items-center gap-2">
								<div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400" />
								<div>
									<h2 className="text-xl font-semibold text-white">Cadastrar</h2>
									<p className="text-sm text-zinc-300">Crie sua conta para acessar o Dashboard</p>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div>
								<label className="mb-1 block text-sm text-zinc-300">Nome</label>
								<input className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 placeholder:text-zinc-400 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20" value={name} onChange={(e) => setName(e.target.value)} required />
							</div>
							<div>
								<label className="mb-1 block text-sm text-zinc-300">Email</label>
								<input className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 placeholder:text-zinc-400 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
							</div>
							<div>
								<label className="mb-1 block text-sm text-zinc-300">Senha</label>
								<div className="relative">
									<input
										className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 pr-10 text-zinc-100 placeholder:text-zinc-400 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										type={showPassword ? "text" : "password"}
										autoComplete="new-password"
										minLength={6}
										required
									/>
									<button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-2 my-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/10 hover:text-white">
										{showPassword ? (
											// Ícone olho aberto
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
												<path d="M1.5 12s3.75-7.5 10.5-7.5S22.5 12 22.5 12 18.75 19.5 12 19.5 1.5 12 1.5 12Z" />
												<path d="M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
											</svg>
										) : (
											// Ícone olho riscado
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
												<path d="M3.98 8.223C2.34 9.676 1.5 12 1.5 12s3.75 7.5 10.5 7.5c1.94 0 3.62-.46 5.03-1.18M8.53 5.53C9.6 5.08 10.77 4.5 12 4.5 18.75 4.5 22.5 12 22.5 12c-.33.66-.77 1.48-1.35 2.31M3 3l18 18" />
											</svg>
										)}
									</button>
								</div>
								<p className="mt-1 text-xs text-zinc-400">Mínimo de 6 caracteres.</p>
							</div>
							{error && <p className="text-sm text-amber-400">{error}</p>}
							{ok && <p className="text-sm text-emerald-300">Cadastro realizado! Você já pode <Link className="underline" href="/login">entrar</Link>.</p>}
							<button disabled={loading} className="group relative mt-2 w-full overflow-hidden rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-3 py-2 font-medium text-white shadow-lg transition enabled:hover:brightness-110 disabled:opacity-60">
								<span className="absolute inset-0 -translate-x-full bg-white/20 transition group-hover:translate-x-0" />
								{loading ? "Cadastrando..." : "Cadastrar"}
							</button>
						</div>

						<div className="mt-6 flex items-center justify-between text-sm">
							<span className="text-zinc-300">Já tem conta?</span>
							<Link className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-4 transition hover:text-emerald-200" href="/login">Entrar</Link>
						</div>

						<div className="mt-6 text-center">
							<p className="text-xs text-zinc-400">Ao continuar, você concorda com nossos Termos e Política de Privacidade.</p>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
