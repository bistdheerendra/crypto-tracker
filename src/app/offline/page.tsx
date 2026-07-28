import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-primary px-5">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-bg-card/80 p-6 text-center shadow-xl">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-muted">Offline mode</p>
        <h1 className="mb-3 text-xl font-bold text-text-primary">No internet connection</h1>
        <p className="mb-5 text-sm text-text-muted">
          You are offline right now. Reconnect to continue with live market data and syncing.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/app/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 px-4 text-sm font-semibold text-accent transition-colors hover:bg-accent/25"
          >
            Try Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/12 bg-white/5 px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-white/10"
          >
            Go Home
          </Link>
        </div>
      </section>
    </main>
  );
}
