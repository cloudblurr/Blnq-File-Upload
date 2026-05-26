"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [showSplash, setShowSplash] = useState(false);
  const [splashResolved, setSplashResolved] = useState(false);

  useEffect(() => {
    const shouldShowSplash = Math.random() < 0.25;
    if (!shouldShowSplash) {
      setSplashResolved(true);
      return;
    }

    setShowSplash(true);
    const timer = setTimeout(() => {
      setShowSplash(false);
      setSplashResolved(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (authLoading || user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400 text-sm">
        Redirecting...
      </div>
    );
  }

  if (!splashResolved || showSplash) {
    return (
      <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-[#050205]">
        <div className="absolute top-[-20%] left-[-12%] w-[680px] h-[680px] rounded-full bg-[#ff7a18]/20 blur-[130px]" />
        <div className="absolute bottom-[-18%] right-[-10%] w-[620px] h-[620px] rounded-full bg-[#ffb347]/18 blur-[140px]" />
        <div className="relative z-10 flex flex-col items-center gap-5">
          <div className="relative splash-logo-wrap">
            <Image
              src="/brand-symbol.jpg"
              alt="Blnq"
              width={120}
              height={120}
              className="rounded-[1.75rem] border border-[#ffb347]/40 shadow-[0_0_35px_rgba(255,122,24,0.35)] splash-logo-base"
              priority
            />
            <Image
              src="/brand-symbol.jpg"
              alt=""
              aria-hidden
              width={120}
              height={120}
              className="rounded-[1.75rem] absolute inset-0 splash-logo-glitch-a pointer-events-none"
            />
            <Image
              src="/brand-symbol.jpg"
              alt=""
              aria-hidden
              width={120}
              height={120}
              className="rounded-[1.75rem] absolute inset-0 splash-logo-glitch-b pointer-events-none"
            />
          </div>
          <p className="text-[11px] uppercase tracking-[0.32em] text-[#ffb347]/85 animate-pulse">Initializing Auth Portal</p>
        </div>

        <style jsx>{`
          .splash-logo-wrap {
            animation: twitch 1.2s steps(2, end) infinite, pulse 1.8s ease-in-out infinite;
          }
          .splash-logo-base {
            animation: logo-jitter 0.14s linear infinite;
          }
          .splash-logo-glitch-a {
            mix-blend-mode: screen;
            opacity: 0.45;
            filter: hue-rotate(18deg) saturate(1.25);
            clip-path: inset(8% 0 58% 0);
            animation: glitch-a 0.22s steps(2, end) infinite;
          }
          .splash-logo-glitch-b {
            mix-blend-mode: lighten;
            opacity: 0.38;
            filter: hue-rotate(-15deg) saturate(1.35);
            clip-path: inset(52% 0 8% 0);
            animation: glitch-b 0.19s steps(2, end) infinite;
          }

          @keyframes pulse {
            0%, 100% { transform: scale(0.98); filter: drop-shadow(0 0 0 rgba(255, 122, 24, 0)); }
            50% { transform: scale(1.06); filter: drop-shadow(0 0 16px rgba(255, 179, 71, 0.5)); }
          }
          @keyframes twitch {
            0%, 100% { transform: translate(0, 0) rotate(0deg); }
            20% { transform: translate(-1px, 1px) rotate(-0.3deg); }
            40% { transform: translate(1px, -1px) rotate(0.4deg); }
            60% { transform: translate(-1px, -1px) rotate(-0.25deg); }
            80% { transform: translate(1px, 1px) rotate(0.25deg); }
          }
          @keyframes logo-jitter {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(0.8px, -0.6px); }
            50% { transform: translate(-0.7px, 0.8px); }
            75% { transform: translate(0.6px, -0.8px); }
          }
          @keyframes glitch-a {
            0%, 100% { transform: translate(0, 0); opacity: 0.3; }
            33% { transform: translate(3px, -1px); opacity: 0.48; }
            66% { transform: translate(-2px, 1px); opacity: 0.36; }
          }
          @keyframes glitch-b {
            0%, 100% { transform: translate(0, 0); opacity: 0.3; }
            33% { transform: translate(-3px, 1px); opacity: 0.44; }
            66% { transform: translate(2px, -1px); opacity: 0.34; }
          }
        `}</style>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error.message || "Login failed");
      } else {
        router.push("/dashboard");
      }
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        setError(error.message || "Signup failed");
      } else {
        setSuccess("Check your email to confirm your account, then log in.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />

      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-b border-zinc-900 z-10">
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold tracking-tighter text-white text-lg shadow-lg shadow-indigo-500/20">
            B
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            Blnq
          </span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto w-full z-10">
        <div className="w-full bg-zinc-900/40 border border-zinc-900 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <h1 className="text-2xl font-bold text-center mb-6 text-zinc-100">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 outline-none text-sm text-zinc-100 transition-all"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:ring-1 focus:ring-zinc-700 outline-none text-sm text-zinc-100 transition-all"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}
            {success && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/10 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                "Processing..."
              ) : mode === "login" ? (
                <><LogIn className="w-4 h-4" /> Sign In</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Account</>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setSuccess(""); }}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
            </button>
          </div>
        </div>

        <Link href="/" className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to Upload
        </Link>
      </main>
    </div>
  );
}
