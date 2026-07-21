import type { WhaleTransaction } from "@/lib/types";

export function whaleDirectionClass(direction: WhaleTransaction["direction"]): string {
  if (direction === "in") return "text-bull";
  if (direction === "out") return "text-bear";
  return "text-text-muted";
}

export function whaleDirectionLabel(direction: WhaleTransaction["direction"]): string {
  if (direction === "unknown") return "UNKNOWN";
  return direction.toUpperCase();
}
