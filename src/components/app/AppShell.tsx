"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import {
  LayoutDashboard,
  BarChart3,
  CandlestickChart,
  MessageSquare,
  Radar,
  FlaskConical,
  Briefcase,
  Settings,
  LogOut,
  Menu,
  X,
  History,
} from "lucide-react";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/analyze", label: "Analyze", icon: BarChart3 },
  { href: "/app/charts", label: "Charts", icon: CandlestickChart },
  { href: "/app/backtest", label: "Backtest", icon: History },
  { href: "/app/copilot", label: "Copilot", icon: MessageSquare },
  { href: "/app/radar", label: "Radar", icon: Radar },
  { href: "/app/scenarios", label: "Scenarios", icon: FlaskConical },
  { href: "/app/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/8">
        <Link
          href="/auth/login"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:text-bear hover:bg-bear/5 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </Link>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen min-h-dvh">
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-bg-secondary/95 backdrop-blur-sm border-b border-white/8">
        <BrandLogo href="/" size="sm" variant="stacked" />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-bg-secondary border-r border-white/8 flex flex-col shadow-2xl">
            <div className="p-5 border-b border-white/8 flex items-center justify-between">
              <BrandLogo href="/" size="sm" variant="stacked" onClick={() => setMenuOpen(false)} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <aside className="hidden lg:flex w-56 shrink-0 border-r border-white/8 bg-bg-secondary/50 flex-col h-screen sticky top-0">
        <div className="p-5 border-b border-white/8">
          <BrandLogo href="/" size="sm" variant="stacked" />
        </div>
        <NavLinks />
      </aside>

      <main className="flex-1 overflow-auto min-w-0 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
