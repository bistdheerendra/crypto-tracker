import type { Bias } from "@/lib/types";

const styles: Record<Bias, string> = {
  BULL: "bg-bull/15 text-bull border-bull/30",
  BEAR: "bg-bear/15 text-bear border-bear/30",
  MIXED: "bg-mixed/15 text-mixed border-mixed/30",
};

export function BiasPill({ bias }: { bias: Bias }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border font-mono-data ${styles[bias]}`}
    >
      {bias}
    </span>
  );
}
