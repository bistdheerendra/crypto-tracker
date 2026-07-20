import { Hero } from "@/components/landing/Hero";
import { EarthRadar } from "@/components/landing/EarthRadar";
import { Pipeline } from "@/components/landing/Pipeline";
import { Synthesis } from "@/components/landing/Synthesis";
import { Delivery } from "@/components/landing/Delivery";
import { CopilotMock } from "@/components/landing/CopilotMock";
import { RadarDrawer } from "@/components/landing/RadarDrawer";
import { ScenarioSimulator } from "@/components/landing/ScenarioSimulator";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { ProgressRail } from "@/components/landing/ProgressRail";
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <nav className="fixed top-8 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-bg-primary/80 backdrop-blur-sm border-b border-white/8 lg:top-auto lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
        <Link href="/" className="font-bold text-base sm:text-lg tracking-tight">
          Dheerendra <span className="text-accent">Intelligence</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4 text-sm">
          <Link href="/auth/login" className="text-text-muted hover:text-text-primary transition-colors px-2 py-1">
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="px-3 sm:px-4 py-2 bg-accent text-bg-primary rounded-lg font-semibold hover:bg-accent/90 transition-colors text-xs sm:text-sm"
          >
            Get started
          </Link>
        </div>
      </nav>

      <ProgressRail />
      <Hero />
      <EarthRadar />
      <Pipeline />
      <Synthesis />
      <Delivery />
      <CopilotMock />
      <RadarDrawer />
      <ScenarioSimulator />
      <FinalCTA />
      <Footer />
    </main>
  );
}
