"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("dc_auth", JSON.stringify({ email }));
    router.push("/app/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="font-bold text-xl mb-8 block">
          Deep<span className="text-accent">Current</span>
        </Link>
        <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
        <p className="text-text-muted text-sm mb-8">Sign in to access your trading intelligence dashboard.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/8 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent/40"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/8 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent/40"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-accent text-bg-primary rounded-lg font-semibold hover:bg-accent/90 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-sm text-text-muted mt-6 text-center">
          No account?{" "}
          <Link href="/auth/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
