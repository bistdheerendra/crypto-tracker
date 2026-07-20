"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Radar,
  FlaskConical,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/analyze", label: "Analyze", icon: BarChart3 },
  { href: "/app/copilot", label: "Copilot", icon: MessageSquare },
  { href: "/app/radar", label: "Radar", icon: Radar },
  { href: "/app/scenarios", label: "Scenarios", icon: FlaskConical },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-white/8 bg-bg-secondary/50 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-white/8">
        <Link href="/" className="font-bold text-lg">
          Deep<span className="text-accent">Current</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:text-text-primary hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/8">
        <Link
          href="/auth/login"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:text-bear hover:bg-bear/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Link>
      </div>
    </aside>
  );
}
