/* eslint-disable @typescript-eslint/no-explicit-any */

const globalForPrisma = globalThis as unknown as { prisma?: any };

/** True when a real Postgres URL is configured (not the Prisma placeholder). */
export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  if (url.includes("johndoe:randompassword")) return false;
  if (url.includes("localhost:5432/mydb")) return false;
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

/**
 * Lazy-load Prisma only when DATABASE_URL is real.
 * Avoids pulling the generated client into the memory-fallback / request path.
 */
export function getPrisma(): any | null {
  if (!isDatabaseConfigured()) return null;
  if (!globalForPrisma.prisma) {
    // Dynamic require keeps the generated client out of the default module graph.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("../generated/prisma/client");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma ?? null;
}
