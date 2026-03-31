"use client";

import { useState } from "react";
import type { PublicUser } from "@/lib/authStore";
import { Loader2, Lock, Mail, UserPlus, LogIn } from "lucide-react";

type AuthPanelProps = {
  onSuccess: (user: PublicUser) => void;
};

type Mode = "login" | "register";

export default function AuthPanel({ onSuccess }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister ? { name, email, password } : { email, password }
        ),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Autentikasi gagal.");
      }

      onSuccess(data.user as PublicUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Autentikasi gagal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-6xl gap-4 p-3 sm:p-4 lg:grid-cols-[1.1fr_.9fr] lg:p-6">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-xl shadow-black/30">
          <div className="flex h-full flex-col justify-between gap-6">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-300">
                Class Code Studio
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Login untuk workspace per user
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
                Setiap akun punya workspace sendiri, file manager sendiri, dan history editor
                yang tersimpan lokal di browser. Cocok untuk praktikum kelas tanpa berantakan.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Keamanan</p>
                <p className="mt-2 text-sm text-zinc-200">Session cookie httpOnly.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Database</p>
                <p className="mt-2 text-sm text-zinc-200">JSON file server-side.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl shadow-black/30 sm:p-6">
          <div className="mx-auto flex h-full max-w-md flex-col justify-center">
            <div className="mb-6">
              <p className="text-sm text-zinc-400">
                {isRegister ? "Buat akun baru" : "Masuk ke akun"}
              </p>
              <h2 className="text-2xl font-semibold text-white">
                {isRegister ? "Register" : "Login"}
              </h2>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {isRegister && (
                <label className="block">
                  <span className="mb-2 block text-sm text-zinc-300">Nama</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                    <UserPlus className="h-4 w-4 text-zinc-500" />
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                      placeholder="Nama kamu"
                      autoComplete="name"
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm text-zinc-300">Email</span>
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <Mail className="h-4 w-4 text-zinc-500" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                    placeholder="nama@email.com"
                    type="email"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-zinc-300">Password</span>
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <Lock className="h-4 w-4 text-zinc-500" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                    placeholder="Minimal 6 karakter"
                    type="password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                  />
                </div>
              </label>

              {error && (
                <div className="rounded-2xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRegister ? (
                  <UserPlus className="h-4 w-4" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {isRegister ? "Buat akun" : "Masuk"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError("");
              }}
              className="mt-4 text-sm text-zinc-400 hover:text-zinc-200"
            >
              {isRegister ? "Sudah punya akun? Login" : "Belum punya akun? Register"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}