import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/8 py-10 sm:py-12 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <p className="font-bold text-lg">Dheerendra Intelligence</p>
          <p className="text-sm text-text-muted">Crypto trading intelligence. Not financial advice.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm text-text-muted">
          <Link href="/terms" className="hover:text-accent transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
          <a href="mailto:support@deepcurrent.ai" className="hover:text-accent transition-colors">Support</a>
        </div>
      </div>
    </footer>
  );
}
