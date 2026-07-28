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
  BookMarked,
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
  { href: "/app/journal", label: "Journal", icon: BookMarked },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const MOBILE_TABS = [
  { href: "/app/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/app/analyze", label: "Analyze", icon: BarChart3 },
  { href: "/app/charts", label: "Charts", icon: CandlestickChart },
  { href: "/app/radar", label: "Radar", icon: Radar },
  { href: "/app/portfolio", label: "Portfolio", icon: Briefcase },
];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const pathname = usePathname();

  function triggerTapFeedback() {
    if ("vibrate" in navigator) {
      navigator.vibrate(12);
    }
  }

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh">
      <header className="safe-top lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-bg-secondary/95 backdrop-blur-sm border-b border-white/8">
        <BrandLogo href="/" size="sm" variant="stacked" />
        <div className="flex items-center gap-2">
          {installPrompt && (
            <button
              type="button"
              onClick={async () => {
                triggerTapFeedback();
                await installPrompt.prompt();
                await installPrompt.userChoice;
                setInstallPrompt(null);
              }}
              className="h-9 rounded-lg border border-accent/30 bg-accent/15 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
            >
              Install App
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerTapFeedback();
              setMenuOpen(true);
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
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
            <div className="safe-top p-5 border-b border-white/8 flex items-center justify-between">
              <BrandLogo href="/" size="sm" variant="stacked" onClick={() => setMenuOpen(false)} />
              <button
                type="button"
                onClick={() => {
                  triggerTapFeedback();
                  setMenuOpen(false);
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
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

      <main className="flex-1 overflow-auto min-w-0 pt-16 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pt-0 lg:pb-0">
        <div className="mx-auto w-full max-w-[1920px]">{children}</div>
      </main>

      <nav className="safe-bottom lg:hidden fixed left-0 right-0 bottom-0 z-40 border-t border-white/8 bg-bg-secondary/95 backdrop-blur-sm">
        <div className="grid grid-cols-5 px-2 pt-1.5 pb-2">
          {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={triggerTapFeedback}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                  active
                    ? "text-accent bg-accent/10 scale-[1.02] shadow-[0_0_0_1px_rgba(62,166,255,0.25)]"
                    : "text-text-muted hover:text-text-primary hover:bg-white/5 active:scale-95"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-transform ${active ? "-translate-y-0.5" : ""}`} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
