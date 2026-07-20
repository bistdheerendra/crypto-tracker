"use client";

import Link from "next/link";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section id="cta" className="py-20 sm:py-32 px-4 sm:px-6 bg-bg-secondary/50">
      <div className="max-w-2xl mx-auto text-center">
        <ScrollReveal>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            Dive deeper into
            <br />
            <span className="bg-gradient-to-r from-accent to-bull bg-clip-text text-transparent">
              every move.
            </span>
          </h2>
          <p className="text-text-muted text-lg mb-10">
            Full access to every feature. No plans. No tokens. No paywalls.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-bg-primary rounded-xl text-base font-semibold hover:bg-accent/90 transition-all glow-accent"
          >
            Create your account
            <ArrowRight className="w-5 h-5" />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
