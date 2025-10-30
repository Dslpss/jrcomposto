"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);
		const res = await signIn("credentials", {
			redirect: false,
			email,
			password,
		});
		setLoading(false);
		if (res?.error) {
			setError("Credenciais inválidas");
		} else {
			window.location.href = "/dashboard";
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
							Juros Inteligentes
						</span>
						<h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
							Sua carteira, seus cenários, em um só lugar
						</h1>
						<p className="max-w-md text-zinc-300">
							Faça login para acessar seu dashboard, simular juros compostos e salvar múltiplos cenários na nuvem.
						</p>
					</div>
				</div>

				{/* Card de login */}
				<div className="order-1 flex items-center justify-center md:order-2">
					<form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md md:p-8">
						<div className="mb-6">
							<div className="flex items-center gap-2">
								<div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400" />
								<div>
									<h2 className="text-xl font-semibold text-white">Entrar</h2>
									<p className="text-sm text-zinc-300">Bem-vindo de volta ao Dashboard</p>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div>
								<label className="mb-1 block text-sm text-zinc-300">Email</label>
								<input
									className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 placeholder:text-zinc-400 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									type="email"
									autoComplete="email"
									required
								/>
							</div>
							<div>
								<label className="mb-1 block text-sm text-zinc-300">Senha</label>
								<input
									className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-zinc-100 placeholder:text-zinc-400 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									type="password"
									autoComplete="current-password"
									required
								/>
							</div>
							{error && <p className="text-sm text-amber-400">{error}</p>}
							<button
								disabled={loading}
								type="submit"
								className="group relative mt-2 w-full overflow-hidden rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 px-3 py-2 font-medium text-white shadow-lg transition enabled:hover:brightness-110 disabled:opacity-60"
							>
								<span className="absolute inset-0 -translate-x-full bg-white/20 transition group-hover:translate-x-0" />
								{loading ? "Entrando..." : "Entrar"}
							</button>
						</div>

						<div className="mt-6 flex items-center justify-between text-sm">
							<span className="text-zinc-300">Não tem conta?</span>
							<Link className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-4 transition hover:text-emerald-200" href="/register">Cadastrar</Link>
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
